import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { IEmailService } from '../interfaces/email-service.interface';
import { IStorageService } from '../interfaces/storage-service.interface';
import { CsvProcessingJob } from '../models/csv-processing.model';
import { EmailMessage } from '../models/email-message.model';
import { JobSchedulerService } from '../services/scheduler/job-scheduler.service';
import { EmailStateService } from '../services/email/email-state.service';
import Redis from 'ioredis';

@Processor('email-processing')
export class EmailProcessingJob extends WorkerHost {
  private readonly logger = new Logger(EmailProcessingJob.name);
  private readonly redis: Redis;
  private readonly lockTimeout = 300000; // 5 minutes lock timeout
  private readonly lockKey = 'email-processing:lock';

  constructor(
    @Inject('IEmailService') private readonly emailService: IEmailService,
    @Inject('IStorageService') private readonly storageService: IStorageService,
    private readonly jobScheduler: JobSchedulerService,
    private readonly emailStateService: EmailStateService,
  ) {
    super();
    
    // Create Redis connection for distributed locking
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });
  }

  async process(job: Job): Promise<any> {
    const lockValue = `${process.env.INSTANCE_ID || 'default'}-${Date.now()}`;
    const lockAcquired = await this.acquireDistributedLock(lockValue);

    if (!lockAcquired) {
      this.logger.warn(`Job ${job.id} skipped - another instance is already processing emails`);
      return { skipped: true, reason: 'Another instance is processing emails' };
    }

    try {
      this.logger.log(`Starting email processing job ${job.id}`);
      
      const emails = await this.emailService.getNewEmails();
      this.logger.log(`Email service returned ${emails.length} emails`);
      
      if (emails.length === 0) {
        this.logger.log('No new emails with CSV attachments found');
        return { success: true, emailsProcessed: 0, completedAt: new Date().toISOString() };
      }

      let latestEmailDate: Date | null = null;

      for (const email of emails) {
        try {
          await this.processEmail(email);
          await this.emailService.markAsProcessed(email.id);
          
          // Track the latest email date for updating the last processed date
          if (!latestEmailDate || email.receivedAt > latestEmailDate) {
            latestEmailDate = email.receivedAt;
          }
        } catch (error) {
          this.logger.error(`Error processing email ${email.id}:`, error);
          throw error; // Let BullMQ handle the retry
        }
      }

      // Update the last processed email date
      if (latestEmailDate) {
        await this.updateLastProcessedDate(latestEmailDate);
      }

      this.logger.log(`Completed processing ${emails.length} emails`);
      return { 
        success: true, 
        emailsProcessed: emails.length, 
        completedAt: new Date().toISOString() 
      };
      
    } catch (error) {
      this.logger.error(`Email processing job ${job.id} failed:`, error.stack);
      throw error; // Re-throw to mark job as failed
    } finally {
      // Always release the lock
      await this.releaseDistributedLock(lockValue);
    }
  }

  private async updateLastProcessedDate(latestEmailDate: Date): Promise<void> {
    try {
      await this.emailStateService.updateLastProcessedEmailDate(latestEmailDate);
      this.logger.debug(`Updated last processed email date to: ${latestEmailDate.toISOString()}`);
    } catch (error) {
      this.logger.error('Error updating last processed email date:', error);
      // Don't throw here - email processing was successful
    }
  }

  private async processEmail(email: EmailMessage): Promise<void> {
    this.logger.log(`Processing email ${email.id} with ${email.attachments.length} CSV attachments`);

    for (const attachment of email.attachments) {
      try {
        // Upload CSV to storage
        const s3Key = await this.storageService.uploadFile(attachment.fileName, attachment.content);

        // Create CSV processing job
        const csvJob: CsvProcessingJob = {
          emailId: email.id,
          fileName: attachment.fileName,
          senderEmail: email.from,
          subject: email.subject,
          receivedAt: email.receivedAt,
          s3Key: s3Key,
        };

        // Enqueue CSV processing job
        await this.jobScheduler.scheduleCsvProcessing(csvJob);
        this.logger.log(`Enqueued CSV processing job for file ${attachment.fileName}`);
      } catch (error) {
        this.logger.error(`Error processing attachment ${attachment.fileName} from email ${email.id}:`, error);
        throw error;
      }
    }
  }

  private async acquireDistributedLock(lockValue: string): Promise<boolean> {
    try {
      // Use SET with NX (only set if not exists) and EX (expire time)
      const result = await this.redis.set(
        this.lockKey,
        lockValue,
        'PX', // milliseconds
        this.lockTimeout,
        'NX' // only set if not exists
      );
      
      return result === 'OK';
    } catch (error) {
      this.logger.error('Failed to acquire distributed lock:', error);
      return false;
    }
  }

  private async releaseDistributedLock(lockValue: string): Promise<void> {
    try {
      // Lua script to safely release lock only if we own it
      const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;
      
      const result = await this.redis.eval(script, 1, this.lockKey, lockValue);
      
      if (result === 1) {
        this.logger.debug('Distributed lock released successfully');
      } else {
        this.logger.warn('Lock was not owned by this instance or already expired');
      }
    } catch (error) {
      this.logger.error('Failed to release distributed lock:', error);
    }
  }

}

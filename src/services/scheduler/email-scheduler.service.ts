import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class EmailSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailSchedulerService.name);
  private readonly retryDelay = parseInt(process.env.JOB_RETRY_DELAY || '3000'); // 3 seconds default for testing

  constructor(
    @InjectQueue('email-processing')
    private readonly emailProcessingQueue: Queue,
  ) {
    this.logger.log('EmailSchedulerService initialized successfully');
  }

  async onApplicationBootstrap() {
    this.logger.log('Setting up recurring email processing job...');
    await this.scheduleRecurringEmailProcessing();
  }

  private async scheduleRecurringEmailProcessing() {
    try {
      // Remove any existing recurring jobs to prevent duplicates
      const existingJobs = await this.emailProcessingQueue.getRepeatableJobs();
      for (const job of existingJobs) {
        if (job.name === 'process-new-emails') {
          await this.emailProcessingQueue.removeRepeatableByKey(job.key);
          this.logger.log(`Removed existing recurring job: ${job.key}`);
        }
      }

      // Schedule the recurring email processing job
      await this.emailProcessingQueue.add(
        'process-new-emails',
        { 
          timestamp: new Date().toISOString(),
          instanceId: process.env.INSTANCE_ID || 'default'
        },
        {
          repeat: {
            every: 5000, // Every 5 seconds
          },
          jobId: 'email-processing-recurring',
          removeOnComplete: 10,
          removeOnFail: 5,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: this.retryDelay, // Configurable retry delay
          },
        }
      );

      this.logger.log('✅ Recurring email processing job scheduled successfully (every 5 seconds)');
    } catch (error) {
      this.logger.error('❌ Failed to schedule recurring email processing job', error.stack);
    }
  }

  // Method to manually trigger the job (useful for testing)
  async triggerEmailProcessing() {
    try {
      const job = await this.emailProcessingQueue.add('process-new-emails', {
        timestamp: new Date().toISOString(),
        manual: true,
      });
      this.logger.log(`Manually triggered email processing job: ${job.id}`);
      return job;
    } catch (error) {
      this.logger.error('Failed to manually trigger email processing job:', error);
      throw error;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CsvProcessingJob, CsvBatchProcessingJob } from '../../models/csv-processing.model';

@Injectable()
export class JobSchedulerService {
  private readonly logger = new Logger(JobSchedulerService.name);
  private readonly retryDelay = parseInt(process.env.JOB_RETRY_DELAY || '3000'); // 3 seconds default for testing

  constructor(
    @InjectQueue('csv-processing')
    private readonly csvProcessingQueue: Queue,
    @InjectQueue('csv-batch-processing')
    private readonly csvBatchProcessingQueue: Queue,
  ) {}

  async scheduleCsvProcessing(csvJob: CsvProcessingJob): Promise<void> {
    try {
      await this.csvProcessingQueue.add(
        'process-csv-file',
        csvJob,
        {
          removeOnComplete: 10,
          removeOnFail: 5,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: this.retryDelay, // Configurable retry delay
          },
        }
      );
      
      this.logger.log(`Scheduled CSV processing job for file: ${csvJob.fileName}`);
    } catch (error) {
      this.logger.error(`Error scheduling CSV processing job:`, error);
      throw error;
    }
  }

  async scheduleBatchProcessing(batchJobs: CsvBatchProcessingJob[]): Promise<void> {
    try {
      // Schedule batches sequentially using job dependencies
      let previousJobId: string | undefined;

      for (let i = 0; i < batchJobs.length; i++) {
        const batchJob = batchJobs[i];
        
        const jobOptions: any = {
          removeOnComplete: 10,
          removeOnFail: 5,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: this.retryDelay, // Configurable retry delay
          },
        };

        // Add dependency on previous job if it exists
        if (previousJobId) {
          jobOptions.dependsOn = [previousJobId];
        }

        const job = await this.csvBatchProcessingQueue.add(
          'process-batch',
          batchJob,
          jobOptions
        );

        previousJobId = job.id;
        
        this.logger.debug(`Scheduled batch job ${batchJob.batchNumber}/${batchJob.totalBatches} for file: ${batchJob.fileName}`);
      }

      this.logger.log(`Scheduled ${batchJobs.length} sequential batch jobs`);
    } catch (error) {
      this.logger.error(`Error scheduling batch processing jobs:`, error);
      throw error;
    }
  }
}

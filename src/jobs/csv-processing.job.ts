import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { ICsvProcessingService } from '../interfaces/csv-processing-service.interface';
import { IStorageService } from '../interfaces/storage-service.interface';
import { CsvProcessingJob as CsvProcessingJobModel, CsvBatchProcessingJob } from '../models/csv-processing.model';
import { JobSchedulerService } from '../services/scheduler/job-scheduler.service';

@Processor('csv-processing')
export class CsvProcessingJob extends WorkerHost {
  private readonly logger = new Logger(CsvProcessingJob.name);

  constructor(
    @Inject('ICsvProcessingService') private readonly csvProcessingService: ICsvProcessingService,
    @Inject('IStorageService') private readonly storageService: IStorageService,
    private readonly jobScheduler: JobSchedulerService,
  ) {
    super();
  }

  async process(job: Job<CsvProcessingJobModel>): Promise<void> {
    try {
      const csvJob = job.data;
      this.logger.log(`Processing CSV file ${csvJob.fileName} from email ${csvJob.emailId}`);

      // Download and validate CSV file
      const csvStream = await this.storageService.downloadFileStream(csvJob.s3Key);
      
      const isValid = await this.csvProcessingService.validateCsv(csvStream);
      if (!isValid) {
        this.logger.error(`CSV file ${csvJob.fileName} failed validation`);
        throw new Error(`CSV file ${csvJob.fileName} is not valid`);
      }

      // Create batch jobs
      const batchJobs = await this.csvProcessingService.createBatchJobs(csvJob);
      
      if (batchJobs.length === 0) {
        this.logger.warn(`No batch jobs created for CSV file ${csvJob.fileName}`);
        return;
      }

      // Enqueue batch processing jobs sequentially
      await this.jobScheduler.scheduleBatchProcessing(batchJobs);

      this.logger.log(`Successfully created ${batchJobs.length} sequential batch jobs for CSV file ${csvJob.fileName}`);
    } catch (error) {
      this.logger.error(`Error processing CSV file ${job.data.fileName} from email ${job.data.emailId}:`, error);
      throw error;
    }
  }
}

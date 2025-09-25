import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { IApiClient } from '../interfaces/api-client.interface';
import { IEmailService } from '../interfaces/email-service.interface';
import { CsvBatchProcessingJob as CsvBatchProcessingJobModel } from '../models/csv-processing.model';
import { ApiRequest, ApiResponse } from '../models/api-request.model';

@Processor('csv-batch-processing')
export class CsvBatchProcessingJob extends WorkerHost {
  private readonly logger = new Logger(CsvBatchProcessingJob.name);

  constructor(
    @Inject('IApiClient') private readonly apiClient: IApiClient,
    @Inject('IEmailService') private readonly emailService: IEmailService,
  ) {
    super();
  }

  async process(job: Job<CsvBatchProcessingJobModel>): Promise<void> {
    try {
      const batchJob = job.data;
      this.logger.log(`Processing batch ${batchJob.batchNumber}/${batchJob.totalBatches} for CSV file ${batchJob.fileName} with ${batchJob.rows.length} rows`);

      // Create API request
      const apiRequest: ApiRequest = {
        fileName: batchJob.fileName,
        senderEmail: batchJob.senderEmail,
        subject: batchJob.subject,
        receivedAt: batchJob.receivedAt,
        data: batchJob.rows,
        isLast: batchJob.isLast,
      };

      // Send data to API
      const response = await this.apiClient.sendData(apiRequest);

      if (!response.success) {
        this.logger.error(`API request failed for batch ${batchJob.batchNumber}/${batchJob.totalBatches} of file ${batchJob.fileName}: ${response.message}`);
        throw new Error(`API request failed: ${response.message}`);
      }

      this.logger.log(`Successfully processed batch ${batchJob.batchNumber}/${batchJob.totalBatches} for CSV file ${batchJob.fileName}`);

      // If this is the last batch, send reply email
      if (batchJob.isLast) {
        await this.sendReplyEmail(batchJob, response);
      }
    } catch (error) {
      this.logger.error(`Error processing batch ${job.data.batchNumber}/${job.data.totalBatches} for CSV file ${job.data.fileName}:`, error);
      throw error;
    }
  }

  private async sendReplyEmail(batchJob: CsvBatchProcessingJobModel, apiResponse: ApiResponse): Promise<void> {
    try {
      const replyContent = this.createReplyContent(batchJob, apiResponse);
      await this.emailService.sendReply(batchJob.emailId, replyContent);
      
      this.logger.log(`Reply email sent for completed processing of CSV file ${batchJob.fileName}`);
    } catch (error) {
      this.logger.error(`Error sending reply email for CSV file ${batchJob.fileName}:`, error);
      // Don't throw here - the batch processing was successful, only the reply failed
    }
  }

  private createReplyContent(batchJob: CsvBatchProcessingJobModel, apiResponse: ApiResponse): string {
    const content = `Dear Supplier,

Your price list file '${batchJob.fileName}' has been successfully processed.

Processing Details:
- File: ${batchJob.fileName}
- Processed: ${new Date().toISOString()}
- Total Batches: ${batchJob.totalBatches}
- Status: Completed

`;

    if (apiResponse.data) {
      return content + `API Response: ${JSON.stringify(apiResponse.data)}\n\n`;
    }

    return content + `Thank you for using Tekara's automated price list processing system.

Best regards,
Tekara Price List Processor`;
  }
}

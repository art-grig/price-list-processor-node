import { Injectable, Logger } from '@nestjs/common';
import csv from 'csv-parser';
import { Readable } from 'stream';
import { ICsvProcessingService } from '../../interfaces/csv-processing-service.interface';
import { IStorageService } from '../../interfaces/storage-service.interface';
import { CsvProcessingJob, CsvBatchProcessingJob } from '../../models/csv-processing.model';

@Injectable()
export class CsvProcessingService implements ICsvProcessingService {
  private readonly logger = new Logger(CsvProcessingService.name);
  private readonly BATCH_SIZE = 1000;

  constructor(private readonly storageService: IStorageService) {}

  async validateCsv(csvStream: any): Promise<boolean> {
    try {
      let rowCount = 0;
      let hasHeaders = false;

      return new Promise((resolve, reject) => {
        const stream = csvStream.pipe(csv())
          .on('data', (row) => {
            rowCount++;
            if (rowCount === 1) {
              hasHeaders = Object.keys(row).length > 0;
            }
          })
          .on('end', () => {
            const isValid = rowCount > 0 && hasHeaders;
            this.logger.debug(`CSV validation: ${rowCount} rows, hasHeaders: ${hasHeaders}, valid: ${isValid}`);
            resolve(isValid);
          })
          .on('error', (error) => {
            this.logger.error('CSV validation error:', error);
            reject(error);
          });
      });
    } catch (error) {
      this.logger.error('Error validating CSV:', error);
      return false;
    }
  }

  async createBatchJobs(csvJob: CsvProcessingJob): Promise<CsvBatchProcessingJob[]> {
    try {
      // Download CSV file from storage
      const csvStream = await this.storageService.downloadFileStream(csvJob.s3Key);
      
      // Parse CSV in batches
      const batches = await this.parseCsvInBatches(csvStream);
      const batchJobs: CsvBatchProcessingJob[] = [];
      
      for (let i = 0; i < batches.length; i++) {
        const batchJob: CsvBatchProcessingJob = {
          emailId: csvJob.emailId,
          fileName: csvJob.fileName,
          senderEmail: csvJob.senderEmail,
          subject: csvJob.subject,
          receivedAt: csvJob.receivedAt,
          s3Key: csvJob.s3Key,
          batchNumber: i + 1,
          totalBatches: batches.length,
          rows: batches[i],
          isLast: i + 1 === batches.length,
        };

        batchJobs.push(batchJob);
      }
      
      this.logger.log(`Created ${batchJobs.length} batch jobs for file: ${csvJob.fileName} (${batches.reduce((sum, batch) => sum + batch.length, 0)} total rows)`);
      return batchJobs;
    } catch (error) {
      this.logger.error(`Error creating batch jobs for file: ${csvJob.fileName}:`, error);
      throw error;
    }
  }

  private async parseCsvInBatches(csvStream: any): Promise<Record<string, any>[][]> {
    const batches: Record<string, any>[][] = [];
    let currentBatch: Record<string, any>[] = [];

    return new Promise((resolve, reject) => {
      csvStream.pipe(csv())
        .on('data', (row) => {
          currentBatch.push(row);
          
          if (currentBatch.length >= this.BATCH_SIZE) {
            batches.push([...currentBatch]);
            currentBatch = [];
          }
        })
        .on('end', () => {
          if (currentBatch.length > 0) {
            batches.push(currentBatch);
          }
          resolve(batches);
        })
        .on('error', reject);
    });
  }
}

import { CsvProcessingJob, CsvBatchProcessingJob } from '../models/csv-processing.model';

export interface ICsvProcessingService {
  validateCsv(csvStream: any): Promise<boolean>;
  createBatchJobs(csvJob: CsvProcessingJob): Promise<CsvBatchProcessingJob[]>;
}

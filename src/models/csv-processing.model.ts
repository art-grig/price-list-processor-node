export class CsvProcessingJob {
  emailId: string;
  fileName: string;
  senderEmail: string;
  subject: string;
  receivedAt: Date;
  s3Key: string;
}

export class CsvBatchProcessingJob {
  emailId: string;
  fileName: string;
  senderEmail: string;
  subject: string;
  receivedAt: Date;
  s3Key: string;
  batchNumber: number;
  totalBatches: number;
  rows: Record<string, any>[];
  
  get isLast(): boolean {
    return this.batchNumber === this.totalBatches;
  }
}

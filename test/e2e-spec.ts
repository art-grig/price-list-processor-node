import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { IEmailService, IMockEmailService } from '../src/interfaces/email-service.interface';
import { EmailMessage, EmailAttachment } from '../src/models/email-message.model';
import { ApiRequest, ApiResponse } from '../src/models/api-request.model';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { EmailStateService } from '../src/services/email/email-state.service';
import { IApiClient } from '../src/interfaces/api-client.interface';

interface ApiCallRecord {
  request: ApiRequest;
  timestamp: Date;
  testId: string;
}

describe('Price List Processor E2E Test', () => {
  let app: INestApplication;
  let emailService: IMockEmailService;
  let emailStateService: EmailStateService;
  let apiClient: IApiClient;
  let emailQueue: Queue;
  let csvQueue: Queue;
  let csvBatchQueue: Queue;
  let apiCalls: ApiCallRecord[];
  let testId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    emailService = app.get<IEmailService>('IEmailService') as IMockEmailService;
    emailStateService = app.get<EmailStateService>(EmailStateService);
    apiClient = app.get<IApiClient>('IApiClient');
    emailQueue = app.get<Queue>(getQueueToken('email-processing'));
    csvQueue = app.get<Queue>(getQueueToken('csv-processing'));
    csvBatchQueue = app.get<Queue>(getQueueToken('csv-batch-processing'));
    
    testId = `test-${Date.now()}`;
    apiCalls = [];

    // Mock API client to track calls
    jest.spyOn(apiClient, 'sendData').mockImplementation(async (request: ApiRequest) => {
      const callRecord: ApiCallRecord = {
        request,
        timestamp: new Date(),
        testId,
      };
      apiCalls.push(callRecord);
      
      console.log(`API Call received: ${request.fileName} with ${request.data.length} rows, IsLast: ${request.isLast}`);
      
      return {
        success: true,
        message: 'E2E test API call successful',
        data: {
          fileName: request.fileName,
          rowCount: request.data.length,
          isLast: request.isLast,
          testId,
          timestamp: new Date(),
        },
      } as ApiResponse;
    });
  });

  afterAll(async () => {
    // Clean up queues
    if (emailQueue) {
      await emailQueue.close();
    }
    if (csvQueue) {
      await csvQueue.close();
    }
    if (csvBatchQueue) {
      await csvBatchQueue.close();
    }
    
    // Close the application
    if (app) {
      await app.close();
    }
    
    // Give a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  beforeEach(async () => {
    // Clear test data before each test
    if (emailService.clearEmails) {
      await emailService.clearEmails();
    }
    await emailStateService.clearAllProcessedEmails();
    apiCalls = [];
  });

  function createSmallCsv(): string {
    return `Product,Price,Stock
Product1,10.99,100
Product2,15.50,50
Product3,8.75,200`;
  }

  function createLargeCsv(): string {
    const header = 'Product,Price,Stock\n';
    const rows: string[] = [];
    
    // Create 2500 rows to ensure multiple batches (1000 each)
    for (let i = 1; i <= 2500; i++) {
      rows.push(`Product${i},${(Math.random() * 100).toFixed(2)},${Math.floor(Math.random() * 1000)}`);
    }
    
    return header + rows.join('\n');
  }

  function createTestEmails(): EmailMessage[] {
    return [
      // Small CSV - should create 1 batch
      {
        id: `email-${testId}-small`,
        from: 'supplier1@example.com',
        subject: `Small Price List [TEST:${testId}]`,
        receivedAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        attachments: [
          {
            fileName: `small-prices-test-${testId}.csv`,
            contentType: 'text/csv',
            content: Buffer.from(createSmallCsv()),
          } as EmailAttachment,
        ],
      },
      
      // Large CSV - should create 3 batches (1000, 1000, 500 rows)
      {
        id: `email-${testId}-large`,
        from: 'supplier2@example.com',
        subject: `Large Price List [TEST:${testId}]`,
        receivedAt: new Date(Date.now() - 3 * 60 * 1000), // 3 minutes ago
        attachments: [
          {
            fileName: `large-prices-test-${testId}.csv`,
            contentType: 'text/csv',
            content: Buffer.from(createLargeCsv()),
          } as EmailAttachment,
        ],
      },
    ];
  }

  async function waitForQueueToBeEmpty(queue: Queue, timeoutMs: number = 60000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      
      console.log(`Queue ${queue.name} - Waiting: ${waiting.length}, Active: ${active.length}`);
      
      if (waiting.length === 0 && active.length === 0) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Queue ${queue.name} did not empty within ${timeoutMs}ms`);
  }

  async function waitForAllQueuesToBeEmpty(): Promise<void> {
    console.log('Waiting for all queues to be empty...');
    await Promise.all([
      waitForQueueToBeEmpty(emailQueue),
      waitForQueueToBeEmpty(csvQueue),
      waitForQueueToBeEmpty(csvBatchQueue),
    ]);
    console.log('All queues are empty');
  }

  async function waitForEmailProcessingCompletion(emails: EmailMessage[]): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = 120000; // 2 minutes
    
    while (Date.now() - startTime < timeoutMs) {
      let allProcessed = true;
      
      for (const email of emails) {
        const isProcessed = await emailService.isEmailProcessedForTest(email.id);
        if (!isProcessed) {
          allProcessed = false;
          break;
        }
      }
      
      if (allProcessed) {
        console.log('All emails have been processed');
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error(`Email processing did not complete within ${timeoutMs}ms`);
  }

  async function verifyCompleteWorkflow(emails: EmailMessage[]): Promise<void> {
    console.log('Verifying complete workflow...');
    
    // Verify all emails were processed
    for (const email of emails) {
      const isProcessed = await emailService.isEmailProcessedForTest(email.id);
      expect(isProcessed).toBe(true);
    }
    console.log('✓ All emails marked as processed');
    
    // Verify API calls were made
    expect(apiCalls.length).toBeGreaterThan(0);
    console.log(`✓ Total API calls made: ${apiCalls.length}`);
    
    // Verify we have both regular and final (isLast=true) calls
    const regularCalls = apiCalls.filter(call => !call.request.isLast);
    const finalCalls = apiCalls.filter(call => call.request.isLast);
    
    expect(regularCalls.length).toBeGreaterThan(0);
    expect(finalCalls.length).toBe(emails.length); // One final call per email
    
    console.log(`✓ Regular API calls: ${regularCalls.length}, Final calls: ${finalCalls.length}`);
    
    // Verify final calls have correct isLast flag and contain test data
    for (const finalCall of finalCalls) {
      expect(finalCall.request.isLast).toBe(true);
      expect(finalCall.request.fileName).toContain(testId);
      expect(finalCall.request.data.length).toBeGreaterThan(0);
    }
    console.log('✓ All final calls have correct isLast flag and test data');
    
    // Verify batch processing order (small CSV should have 1 batch, large should have multiple)
    const smallEmailCalls = apiCalls.filter(call => call.request.fileName.includes('small'));
    const largeEmailCalls = apiCalls.filter(call => call.request.fileName.includes('large'));
    
    expect(smallEmailCalls.length).toBe(1); // Small CSV should have 1 batch
    expect(largeEmailCalls.length).toBeGreaterThan(1); // Large CSV should have multiple batches
    
    console.log(`✓ Small email batches: ${smallEmailCalls.length}, Large email batches: ${largeEmailCalls.length}`);
    
    // Verify data integrity - check that all API calls contain valid CSV data
    for (const call of apiCalls) {
      expect(call.request.data).toBeDefined();
      expect(Array.isArray(call.request.data)).toBe(true);
      expect(call.request.data.length).toBeGreaterThan(0);
      
      // Verify each row has the expected CSV structure
      for (const row of call.request.data) {
        expect(row).toHaveProperty('Product');
        expect(row).toHaveProperty('Price');
        expect(row).toHaveProperty('Stock');
      }
    }
    console.log('✓ All API calls contain valid CSV data structure');
    
    console.log('Complete workflow verification successful!');
  }

  it('should process emails end-to-end with complete workflow', async () => {
    console.log(`Starting E2E test with ID: ${testId}`);
    
    // Arrange - Create test emails with different scenarios
    const emails = createTestEmails();
    console.log(`Created ${emails.length} test emails`);
    
    // Act - Seed emails and trigger processing
    await emailService.clearEmails();
    for (const email of emails) {
      await emailService.addTestEmail(email);
    }
    console.log(`Seeded ${emails.length} test emails`);
    
    // Trigger email processing job
    console.log('Triggering email processing job...');
    const emailJob = await emailQueue.add('process-new-emails', {}, {
      removeOnComplete: 10,
      removeOnFail: 10,
    });
    
    // Wait for email processing to complete
    console.log('Waiting for email processing to complete...');
    
    // Wait for all subsequent jobs to complete
    await waitForAllQueuesToBeEmpty();
    
    // Wait for email processing completion
    await waitForEmailProcessingCompletion(emails);
    
    // Assert - Verify complete workflow
    await verifyCompleteWorkflow(emails);
    
    console.log(`E2E test completed successfully for test ID: ${testId}`);
  }, 180000); // 3 minutes timeout
});

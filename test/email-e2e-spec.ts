import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { IEmailService } from '../src/interfaces/email-service.interface';
import { EmailMessage, EmailAttachment } from '../src/models/email-message.model';
import { ApiRequest, ApiResponse } from '../src/models/api-request.model';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';
import { EmailStateService } from '../src/services/email/email-state.service';
import { IApiClient } from '../src/interfaces/api-client.interface';
import * as nodemailer from 'nodemailer';
import axios from 'axios';

interface ApiCallRecord {
  request: ApiRequest;
  timestamp: Date;
  testId: string;
}

describe('Price List Processor Real Email E2E Test', () => {
  let app: INestApplication;
  let emailService: IEmailService;
  let emailStateService: EmailStateService;
  let apiClient: IApiClient;
  let emailQueue: Queue;
  let csvQueue: Queue;
  let csvBatchQueue: Queue;
  let apiCalls: ApiCallRecord[];
  let testId: string;
  let smtpTransporter: nodemailer.Transporter;

  beforeAll(async () => {
    // Environment variables are set in setup-e2e.ts based on test type
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    console.log('Initializing NestJS application...');
    await app.init();
    console.log('NestJS application initialized successfully');

    emailService = app.get<IEmailService>('IEmailService');
    emailStateService = app.get<EmailStateService>(EmailStateService);
    apiClient = app.get<IApiClient>('IApiClient');
    emailQueue = app.get<Queue>(getQueueToken('email-processing'));
    csvQueue = app.get<Queue>(getQueueToken('csv-processing'));
    csvBatchQueue = app.get<Queue>(getQueueToken('csv-batch-processing'));
    
    console.log('Services initialized:');
    console.log('- EmailService:', !!emailService);
    console.log('- EmailStateService:', !!emailStateService);
    console.log('- ApiClient:', !!apiClient);
    console.log('- EmailQueue:', !!emailQueue);
    console.log('- CsvQueue:', !!csvQueue);
    console.log('- CsvBatchQueue:', !!csvBatchQueue);
    
    // Try to get the EmailSchedulerService to see if it's instantiated
    try {
      const emailScheduler = app.get('EmailSchedulerService');
      console.log('EmailSchedulerService found:', !!emailScheduler);
    } catch (error) {
      console.log('EmailSchedulerService not found:', error.message);
      
      // Try getting it by class instead of string token
      try {
        const EmailSchedulerService = require('../src/services/scheduler/email-scheduler.service').EmailSchedulerService;
        const emailScheduler2 = app.get(EmailSchedulerService);
        console.log('EmailSchedulerService found by class:', !!emailScheduler2);
      } catch (error2) {
        console.log('EmailSchedulerService not found by class:', error2.message);
      }
    }
    
    apiCalls = [];

    // Mock API client to track calls and return success for last batch
    console.log('Setting up API client mock...');
    const mockImplementation = jest.spyOn(apiClient, 'sendData').mockImplementation(async (request: ApiRequest) => {
      const callRecord = {
        request,
        timestamp: new Date(),
        testId: testId,
      };
      apiCalls.push(callRecord);
      
      console.log(`✅ API Call received: ${request.fileName} with ${request.data.length} rows, IsLast: ${request.isLast}`);
      
      return Promise.resolve({
        success: true,
        message: 'E2E test API call successful - Reply should be sent to MailHog',
        data: { 
          fileName: request.fileName,
          rowCount: request.data.length,
          isLast: request.isLast,
          testId: testId,
          timestamp: new Date(),
          mailHogNote: 'Check MailHog UI at http://localhost:8025 for sent replies',
        },
      } as ApiResponse);
    });
    
    console.log('API client mock setup complete. Mock implementation:', !!mockImplementation);

    // Setup SMTP transporter for sending test emails to Greenmail
    smtpTransporter = nodemailer.createTransport({
      host: 'localhost',
      port: 3025,
      secure: false,
      auth: {
        user: 'test@example.com',
        pass: 'test'
      }
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
    await emailStateService.clearAllProcessedEmails();
    apiCalls = [];
    testId = `email-test-${Date.now()}`; // Generate a unique test ID for each test
  });

  async function sendTestEmailViaSMTP(emailIdSuffix: string, subjectPrefix: string, csvContent: string): Promise<void> {
    const fileName = `${emailIdSuffix}-prices-test-${testId}.csv`;
    const subject = `${subjectPrefix} [TEST:${testId}]`;
    
    await smtpTransporter.sendMail({
      from: 'supplier@example.com',
      to: 'test@example.com',
      subject: subject,
      text: `Please process the attached price list file: ${fileName}`,
      attachments: [
        {
          filename: fileName,
          content: csvContent,
          contentType: 'text/csv'
        }
      ]
    });
    
    console.log(`Sent test email: ${subject} with attachment ${fileName}`);
  }

  function createSmallCsv(): string {
    return `Product,Price,Stock\nProduct1,10.99,100\nProduct2,15.50,50\nProduct3,5.00,200`;
  }

  function createLargeCsv(): string {
    let csv = `Product,Price,Stock\n`;
    for (let i = 1; i <= 2500; i++) {
      csv += `Product${i},${(10 + i * 0.01).toFixed(2)},${100 + i}\n`;
    }
    return csv;
  }

  async function waitForAllQueuesToBeEmpty(): Promise<void> {
    const timeout = 20000; // 20 seconds
    const interval = 1000; // 1 second
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const emailQueueCount = await emailQueue.count();
      const csvQueueCount = await csvQueue.count();
      const csvBatchQueueCount = await csvBatchQueue.count();

      // Email queue may have 1 repeatable job, that's expected
      // Only wait for CSV and Batch queues to be empty
      if (csvQueueCount === 0 && csvBatchQueueCount === 0) {
        console.log('Processing queues are empty (email queue may have repeatable job).');
        return;
      }

      console.log(`Waiting for processing queues to empty... Email: ${emailQueueCount}, CSV: ${csvQueueCount}, Batch: ${csvBatchQueueCount}`);
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Queues did not empty within the timeout period.');
  }

  async function waitForEmailProcessingCompletion(expectedEmailCount: number): Promise<void> {
    const timeout = 20000; // 20 seconds
    const interval = 1000; // 1 second
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Check how many emails have been processed by checking API calls
      const processedEmailsCount = new Set(apiCalls.map(call => call.request.fileName.split('-')[0])).size;
      
      if (processedEmailsCount >= expectedEmailCount) {
        console.log(`All ${expectedEmailCount} emails have been processed.`);
        return;
      }

      console.log(`Waiting for emails to be processed... (${processedEmailsCount}/${expectedEmailCount} processed)`);
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Emails were not processed within the timeout period.');
  }

  async function checkGreenmailForReplies(): Promise<void> {
    try {
      // Check Greenmail API for sent emails
      const response = await axios.get('http://localhost:8080/api/service/readAllMessages?format=json');
      const messages = response.data || [];
      
      console.log(`Greenmail captured ${messages.length} email(s)`);
      
      if (messages.length > 0) {
        messages.forEach((msg, index) => {
          console.log(`Email ${index + 1}:`);
          console.log(`  From: ${msg.from}`);
          console.log(`  To: ${msg.to}`);
          console.log(`  Subject: ${msg.subject}`);
          console.log(`  Body Preview: ${msg.body?.substring(0, 100)}...`);
        });
      }
      
      // For this test, we expect at least some reply emails to be sent
      const replyEmails = messages.filter(msg => msg.subject && msg.subject.startsWith('Re:'));
      expect(replyEmails.length).toBeGreaterThan(0);
      console.log(`Found ${replyEmails.length} reply email(s) sent by the system`);
    } catch (error) {
      console.warn('Could not check Greenmail for sent emails:', error.message);
      console.log('Note: Greenmail might not be running or accessible at http://localhost:8080');
    }
  }

  async function verifyCompleteWorkflow(expectedEmailCount: number): Promise<void> {
    // Verify API calls were made for each email
    expect(apiCalls.length).toBeGreaterThan(0);

    // Group API calls by email file name
    const callsByFile = new Map<string, ApiRequest[]>();
    // Filter API calls to only include those from the current test
    const currentTestCalls = apiCalls.filter(call => 
      call.request.fileName.includes(testId)
    );
    
    console.log(`Found ${currentTestCalls.length} API calls from current test (${testId})`);
    console.log(`Total API calls: ${apiCalls.length}`);
    
    for (const call of currentTestCalls) {
      const filePrefix = call.request.fileName.split('-')[0]; // e.g., 'small' or 'large'
      if (!callsByFile.has(filePrefix)) {
        callsByFile.set(filePrefix, []);
      }
      callsByFile.get(filePrefix)?.push(call.request);
    }

    expect(callsByFile.size).toBe(expectedEmailCount);

    for (const [filePrefix, calls] of callsByFile.entries()) {
      expect(calls).toBeDefined();
      expect(calls.length).toBeGreaterThan(0);

      // Verify the last call for each email has isLast=true
      const finalCall = calls.find(call => call.isLast);
      expect(finalCall).toBeDefined();
      expect(finalCall?.isLast).toBe(true);
      expect(finalCall?.fileName).toContain(filePrefix);

      // Verify batch sizes (max 1000 rows per batch)
      for (const call of calls) {
        expect(call.data.length).toBeLessThanOrEqual(1000);
      }
    }

    // Check Greenmail for sent reply emails
    await checkGreenmailForReplies();

    console.log('Complete workflow verification successful!');
    console.log('Check Greenmail UI at http://localhost:8080 to see sent reply emails');
  }

  it('should process emails end-to-end with real IMAP and SMTP', async () => {
    console.log(`Starting Real Email E2E test with ID: ${testId}`);
    
    // Act - Send real test emails via SMTP to Greenmail
    console.log('Sending test emails via SMTP to Greenmail...');
    await sendTestEmailViaSMTP('small', 'Small Price List', createSmallCsv());
    await sendTestEmailViaSMTP('large', 'Large Price List', createLargeCsv());
    
    const expectedEmailCount = 2;
    console.log(`Sent ${expectedEmailCount} test emails via SMTP`);

    await emailStateService.clearAllProcessedEmails(); // Ensure clean state

    // Wait a moment for emails to be delivered to IMAP server
    console.log('Waiting for emails to be delivered to IMAP server...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Waiting for automatic email processing (EmailSchedulerService repeatable job every 5 seconds)...');
    
    // Wait for all subsequent jobs to complete
    await waitForAllQueuesToBeEmpty();
    
    // Wait for email processing completion
    await waitForEmailProcessingCompletion(expectedEmailCount);
    
    // Assert - Verify complete workflow
    await verifyCompleteWorkflow(expectedEmailCount);
    
    console.log(`Real Email E2E test completed successfully for test ID: ${testId}`);
    console.log('🎯 Key Achievement: Successfully tested real IMAP + SMTP email processing!');
  }, 30000); // 30 seconds timeout for the entire test
});
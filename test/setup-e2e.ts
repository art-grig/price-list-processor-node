import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Override configuration for E2E tests
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6380';
process.env.REDIS_PASSWORD = '';

process.env.MINIO_ENDPOINT = 'localhost';
process.env.MINIO_PORT = '9002';
process.env.MINIO_USE_SSL = 'false';
process.env.MINIO_ACCESS_KEY = 'minioadmin';
process.env.MINIO_SECRET_KEY = 'minioadmin';
process.env.MINIO_BUCKET_NAME = 'test-bucket';

// Set EMAIL_PROVIDER based on test type
// For email E2E tests, we need to detect if we're running the email test
const isEmailE2ETest = process.argv.some(arg => 
  arg.includes('email-e2e-spec') || 
  arg.includes('Price List Processor Real Email E2E Test')
);

if (isEmailE2ETest) {
  // Configure for real IMAP testing
  process.env.EMAIL_PROVIDER = 'imap';
  process.env.IMAP_HOST = 'localhost';
  process.env.IMAP_PORT = '3143';
  process.env.IMAP_USE_SSL = 'false';
  process.env.IMAP_USERNAME = 'test@example.com';
  process.env.IMAP_PASSWORD = 'test';
  
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '3025';
  process.env.SMTP_USE_SSL = 'false';
  process.env.SMTP_USERNAME = 'test@example.com';
  process.env.SMTP_PASSWORD = 'test';
} else {
  // Default to mock for other tests
  process.env.EMAIL_PROVIDER = 'mock';
}

process.env.API_BASE_URL = 'http://httpbin.org';
process.env.API_TIMEOUT = '30000';

// Set shorter retry delay for testing (3 seconds instead of 5 minutes)
process.env.JOB_RETRY_DELAY = '3000';

console.log('E2E Test Environment Setup Complete');
console.log('Redis:', `${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
console.log('MinIO:', `${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`);
console.log('Email Service:', process.env.EMAIL_PROVIDER);
console.log('API Base URL:', process.env.API_BASE_URL);
console.log('Job Retry Delay:', `${process.env.JOB_RETRY_DELAY}ms`);

# Price List Processor - NestJS Implementation

A NestJS application that automatically processes CSV price lists received via email, using BullMQ for job management and MinIO for file storage.

## Features

- **Email Processing**: Supports POP3, IMAP, and Mock email providers
- **CSV Processing**: Validates and processes CSV files in batches of 1000 rows
- **Sequential Processing**: Ensures batches are processed in order with the last batch marked appropriately
- **Storage**: Uses MinIO (S3-compatible) for CSV file storage
- **Job Queue**: BullMQ with Redis for reliable job processing
- **Retry Logic**: Automatic retry with exponential backoff for failed jobs
- **API Integration**: Sends processed data to external API endpoints
- **Email Replies**: Sends processing results back to original sender

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Email Source  │───▶│  Email Service   │───▶│  Storage (MinIO)│
│  (POP3/IMAP)    │    │  (Poll/Process)  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   BullMQ        │◀───│  CSV Processing  │───▶│  External API   │
│   Job Queue     │    │     Service      │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Redis
- MinIO

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment configuration:
   ```bash
   cp env.example .env
   ```

4. Start the required services:
   ```bash
   docker-compose up -d
   ```

## Configuration

### Environment Variables

- `REDIS_HOST`: Redis host (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)
- `MINIO_ENDPOINT`: MinIO endpoint (default: localhost)
- `MINIO_PORT`: MinIO port (default: 9000)
- `MINIO_ACCESS_KEY`: MinIO access key (default: minioadmin)
- `MINIO_SECRET_KEY`: MinIO secret key (default: minioadmin)
- `EMAIL_PROVIDER`: Email provider (mock, imap, pop3)
- `API_BASE_URL`: External API base URL

## Running the Application

### Development
```bash
npm run start:dev
```

### Production
```bash
npm run build
npm run start:prod
```

## Testing

### Unit Tests
```bash
npm run test
```

### E2E Tests

Run comprehensive end-to-end tests:

```bash
# Start test services (Redis, MinIO, Mail Server)
npm run test:e2e:setup

# Run all E2E tests
npm run test:e2e

# Run only mock-based E2E tests
npm run test:e2e:mock

# Run only real email E2E tests (requires mail server)
npm run test:e2e:email

# Clean up test services
npm run test:e2e:teardown

# Run full E2E test cycle (all tests)
npm run test:e2e:full

# Run full email E2E test cycle (with mail server)
npm run test:e2e:email:full
```

#### Test Types

1. **Mock E2E Test** (`e2e-spec.ts`): Uses mock email service for fast testing
2. **Real Email E2E Test** (`email-e2e-spec.ts`): Uses actual IMAP/SMTP with docker-mailserver

#### Mail Server Setup

The test environment includes a full mail server with:
- **Accounts**: 
  - `supplier@example.com` (password: `supplier123`) - for sending test emails
  - `processor@example.com` (password: `processor123`) - for receiving and processing emails
- **Protocols**: SMTP (port 25, 587), IMAP (port 143, 993)
- **SSL**: Self-signed certificates for testing

## API Endpoints

### Test Endpoints
- `GET /api/test/health` - Health check
- `GET /api/test/email-service-type` - Get current email service type
- `POST /api/test/seed-test-emails` - Add test emails to mock service
- `POST /api/test/trigger-email-processing` - Manually trigger email processing
- `POST /api/test/clear-emails` - Clear test emails
- `GET /api/test/last-processed-date` - Get last processed email date and stats
- `POST /api/test/reset-last-processed-date` - Reset last processed date for testing

## Processing Flow

1. **Incremental Email Polling**: Background service polls for emails newer than last processed date
2. **CSV Detection**: Identifies emails with CSV attachments
3. **File Upload**: Uploads CSV files to MinIO storage
4. **CSV Validation**: Validates CSV format and structure
5. **Batch Creation**: Splits CSV into batches of 1000 rows
6. **Sequential Processing**: Processes batches in order using BullMQ
7. **API Calls**: Sends each batch to external API
8. **Reply Email**: Sends processing results to original sender
9. **Date Tracking**: Updates last processed email date for next polling cycle

## Error Handling

- **Automatic Retry**: Failed jobs retry 3 times with exponential backoff
- **Failed Queue**: Permanently failed jobs move to "failed" queue
- **Logging**: Comprehensive logging with NestJS Logger
- **Sequential Guarantee**: Last batch only processes after all previous batches succeed

## Project Structure

```
src/
├── config/                 # Configuration files
├── controllers/            # API controllers
├── interfaces/             # Service contracts
├── jobs/                   # BullMQ job processors
├── models/                 # Domain models
├── services/               # Business logic services
│   ├── api/               # API client
│   ├── csv/               # CSV processing
│   ├── email/             # Email services
│   ├── scheduler/         # Job scheduling
│   └── storage/           # File storage
└── main.ts                # Application entry point
```

## Development

### Adding New Email Providers

1. Implement the `IEmailService` interface
2. Add the provider to the factory in `app.module.ts`
3. Update configuration schema

### Adding New Storage Providers

1. Implement the `IStorageService` interface
2. Add the provider to the factory in `app.module.ts`
3. Update configuration schema

## License

MIT

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from '@nestjs-modules/ioredis';
import configuration from './config/configuration';
import { EmailProcessingJob } from './jobs/email-processing.job';
import { CsvProcessingJob } from './jobs/csv-processing.job';
import { CsvBatchProcessingJob } from './jobs/csv-batch-processing.job';
import { MockEmailService } from './services/email/mock-email.service';
import { ImapEmailService } from './services/email/imap-email.service';
import { Pop3EmailService } from './services/email/pop3-email.service';
import { MinioStorageService } from './services/storage/minio-storage.service';
import { ApiClientService } from './services/api/api-client.service';
import { CsvProcessingService } from './services/csv/csv-processing.service';
import { EmailSchedulerService } from './services/scheduler/email-scheduler.service';
import { EmailCleanupService } from './services/scheduler/email-cleanup.service';
import { JobSchedulerService } from './services/scheduler/job-scheduler.service';
import { TestController } from './controllers/test.controller';
import { IStorageService } from './interfaces/storage-service.interface';
import { EmailStateService } from './services/email/email-state.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    RedisModule.forRootAsync({
      useFactory: () => ({
        type: 'single',
        options: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD || '',
        },
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const config = {
          connection: {
            host: configService.get<string>('config.database.host'),
            port: configService.get<number>('config.database.port'),
            password: configService.get<string>('config.database.password'),
          },
        };
        console.log('BullModule Redis config:', config);
        return config;
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: 'email-processing' },
      { name: 'csv-processing' },
      { name: 'csv-batch-processing' },
    ),
  ],
  controllers: [TestController],
  providers: [
    {
      provide: 'IEmailService',
      useFactory: (configService: ConfigService, emailStateService: EmailStateService) => {
        const provider = configService.get<string>('config.email.provider');
        if (provider === 'imap') {
          return new ImapEmailService(configService.get('config.email'), emailStateService);
        } else if (provider === 'pop3') {
          return new Pop3EmailService(configService.get('config.email'));
        }
        return new MockEmailService(emailStateService);
      },
      inject: [ConfigService, EmailStateService],
    },
    {
      provide: 'IStorageService',
      useFactory: (configService: ConfigService) => {
        return new MinioStorageService(configService.get('config.minio'));
      },
      inject: [ConfigService],
    },
    {
      provide: 'IApiClient',
      useFactory: (configService: ConfigService) => {
        return new ApiClientService(configService.get('config.api'));
      },
      inject: [ConfigService],
    },
    {
      provide: 'ICsvProcessingService',
      useFactory: (storageService: IStorageService) => {
        return new CsvProcessingService(storageService);
      },
      inject: ['IStorageService'],
    },
    EmailStateService,
    EmailSchedulerService,
    EmailCleanupService,
    JobSchedulerService,
    EmailProcessingJob,
    CsvProcessingJob,
    CsvBatchProcessingJob,
  ],
})
export class AppModule {}

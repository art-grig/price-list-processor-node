import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailStateService } from '../email/email-state.service';

@Injectable()
export class EmailCleanupService {
  private readonly logger = new Logger(EmailCleanupService.name);

  constructor(private readonly emailStateService: EmailStateService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOldProcessedEmails() {
    try {
      this.logger.log('Starting email cleanup job');
      
      const countBefore = await this.emailStateService.getProcessedEmailsCount();
      await this.emailStateService.cleanupOldProcessedEmails();
      const countAfter = await this.emailStateService.getProcessedEmailsCount();
      
      const cleanedCount = countBefore - countAfter;
      this.logger.log(`Email cleanup completed. Removed ${cleanedCount} old processed emails`);
    } catch (error) {
      this.logger.error('Error during email cleanup:', error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async logEmailStats() {
    try {
      const processedCount = await this.emailStateService.getProcessedEmailsCount();
      this.logger.debug(`Currently tracking ${processedCount} processed emails`);
    } catch (error) {
      this.logger.error('Error logging email stats:', error);
    }
  }
}

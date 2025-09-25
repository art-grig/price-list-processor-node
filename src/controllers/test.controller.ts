import { Controller, Get, Post, Body, Inject } from '@nestjs/common';
import { IEmailService } from '../interfaces/email-service.interface';
import { EmailMessage } from '../models/email-message.model';
import { EmailStateService } from '../services/email/email-state.service';

@Controller('api/test')
export class TestController {
  constructor(
    @Inject('IEmailService')
    private readonly emailService: IEmailService,
    private readonly emailStateService: EmailStateService,
  ) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'price-list-processor-nest',
    };
  }

  @Get('email-service-type')
  getEmailServiceType() {
    return {
      type: this.emailService.constructor.name,
    };
  }

  @Post('seed-test-emails')
  async seedTestEmails(@Body() testEmails: EmailMessage[]) {
    if ('seedTestEmails' in this.emailService) {
      await (this.emailService as any).seedTestEmails(testEmails);
      return { message: `Seeded ${testEmails.length} test emails` };
    }
    return { message: 'Email service does not support seeding test emails' };
  }

  @Post('trigger-email-processing')
  async triggerEmailProcessing() {
    // This would trigger the email processing job manually
    return { message: 'Email processing triggered' };
  }

  @Post('clear-emails')
  async clearEmails() {
    if ('clearEmails' in this.emailService) {
      await (this.emailService as any).clearEmails();
      return { message: 'Test emails cleared' };
    }
    return { message: 'Email service does not support clearing emails' };
  }

  @Get('last-processed-date')
  async getLastProcessedDate() {
    const lastDate = await this.emailStateService.getLastProcessedEmailDate();
    const fallbackDate = await this.emailStateService.getLastProcessedEmailDateWithFallback();
    const processedCount = await this.emailStateService.getProcessedEmailsCount();
    
    return {
      lastProcessedDate: lastDate?.toISOString() || null,
      fallbackDate: fallbackDate.toISOString(),
      processedEmailsCount: processedCount,
    };
  }

  @Post('reset-last-processed-date')
  async resetLastProcessedDate() {
    // Reset to 24 hours ago
    const resetDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.emailStateService.updateLastProcessedEmailDate(resetDate);
    
    return { 
      message: 'Last processed date reset',
      resetTo: resetDate.toISOString(),
    };
  }
}

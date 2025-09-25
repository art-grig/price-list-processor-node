import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage } from '../../models/email-message.model';
import { IMockEmailService } from '../../interfaces/email-service.interface';
import { EmailStateService } from './email-state.service';

@Injectable()
export class MockEmailService implements IMockEmailService {
  private readonly logger = new Logger(MockEmailService.name);
  private emails: Map<string, EmailMessage> = new Map();
  private sentReplies: Map<string, string> = new Map();

  constructor(private readonly emailStateService: EmailStateService) {}

  async getNewEmails(): Promise<EmailMessage[]> {
    const unprocessedEmails: EmailMessage[] = [];
    
    // Get the last processed email date
    const lastProcessedDate = await this.emailStateService.getLastProcessedEmailDateWithFallback();
    
    for (const email of this.emails.values()) {
      const isProcessed = await this.emailStateService.isEmailProcessed(email.id);
      if (!isProcessed && email.receivedAt > lastProcessedDate) {
        unprocessedEmails.push(email);
      }
    }
    
    this.logger.debug(`Found ${unprocessedEmails.length} new emails since ${lastProcessedDate.toISOString()}`);
    return unprocessedEmails;
  }

  async sendReply(originalEmailId: string, replyContent: string): Promise<void> {
    this.sentReplies.set(originalEmailId, replyContent);
    this.logger.log(`Reply sent for email ${originalEmailId}`);
  }

  async markAsProcessed(emailId: string): Promise<void> {
    try {
      await this.emailStateService.markEmailAsProcessed(emailId, {
        provider: 'mock',
        markedAt: new Date().toISOString(),
      });
      this.logger.debug(`Email ${emailId} marked as processed`);
    } catch (error) {
      this.logger.error(`Error marking email ${emailId} as processed:`, error);
      throw error;
    }
  }

  async seedTestEmails(testEmails: EmailMessage[]): Promise<void> {
    for (const email of testEmails) {
      this.emails.set(email.id, email);
    }
    this.logger.log(`Seeded ${testEmails.length} test emails`);
  }

  async addTestEmail(email: EmailMessage): Promise<void> {
    this.logger.log(`Adding test email: ${email.id}`);
    this.emails.set(email.id, email);
  }

  async clearEmails(): Promise<void> {
    this.emails.clear();
    this.sentReplies.clear();
    await this.emailStateService.clearAllProcessedEmails();
    this.logger.log('Cleared all test emails and processed state');
  }

  async isEmailProcessedForTest(emailId: string): Promise<boolean> {
    return await this.emailStateService.isEmailProcessed(emailId);
  }

  getSentRepliesForTest(): Map<string, string> {
    return new Map(this.sentReplies);
  }
}

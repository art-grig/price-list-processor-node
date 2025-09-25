import { EmailMessage } from '../models/email-message.model';

export interface IEmailService {
  getNewEmails(): Promise<EmailMessage[]>;
  sendReply(originalEmailId: string, replyContent: string): Promise<void>;
  markAsProcessed(emailId: string): Promise<void>;
}

export interface IMockEmailService extends IEmailService {
  seedTestEmails(testEmails: EmailMessage[]): Promise<void>;
  addTestEmail(email: EmailMessage): Promise<void>;
  clearEmails(): Promise<void>;
  isEmailProcessedForTest(emailId: string): Promise<boolean>;
  getSentRepliesForTest(): Map<string, string>;
}

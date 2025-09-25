import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';
import { EmailMessage, EmailAttachment } from '../../models/email-message.model';
import { IEmailService } from '../../interfaces/email-service.interface';
import { EmailConfig } from '../../config/configuration';
import { EmailStateService } from './email-state.service';

@Injectable()
export class ImapEmailService implements IEmailService {
  private readonly logger = new Logger(ImapEmailService.name);
  private smtpTransporter: nodemailer.Transporter;

  constructor(
    private readonly emailConfig: EmailConfig,
    private readonly emailStateService: EmailStateService,
  ) {
    if (!emailConfig.imap) {
      throw new Error('IMAP configuration is required');
    }

    // Initialize SMTP transporter for sending replies
    if (emailConfig.smtp) {
      this.smtpTransporter = nodemailer.createTransport({
        host: emailConfig.smtp.host,
        port: emailConfig.smtp.port,
        secure: emailConfig.smtp.useSSL,
        auth: {
          user: emailConfig.smtp.username,
          pass: emailConfig.smtp.password,
        },
      });
    }
  }

  private createImapClient(): ImapFlow {
    return new ImapFlow({
      host: this.emailConfig.imap!.host,
      port: this.emailConfig.imap!.port,
      secure: this.emailConfig.imap!.useSSL,
      auth: {
        user: this.emailConfig.imap!.username,
        pass: this.emailConfig.imap!.password,
      },
      logger: false, // Disable verbose IMAP logging
    });
  }

  async getNewEmails(): Promise<EmailMessage[]> {
    const client = this.createImapClient();
    try {
      await client.connect();
      await client.mailboxOpen('INBOX');

      // Get the last processed email date
      const lastProcessedDate = await this.emailStateService.getLastProcessedEmailDateWithFallback();
      
      // Search for emails newer than the last processed date
      const searchCriteria = {
        since: lastProcessedDate,
        // Don't filter by seen status since we're using date-based filtering
      };

      this.logger.debug(`Searching for emails since: ${lastProcessedDate.toISOString()}`);
      const messages = await client.search(searchCriteria);
      const emails: EmailMessage[] = [];

      if (!Array.isArray(messages)) {
        return [];
      }

      for (const messageId of messages) {
        try {
          // Check if email was already processed
          const isProcessed = await this.emailStateService.isEmailProcessed(messageId.toString());
          if (isProcessed) {
            this.logger.debug(`Email ${messageId} already processed, skipping`);
            continue;
          }

          const email = await this.fetchEmail(client, messageId);
          if (email && this.hasCsvAttachments(email)) {
            emails.push(email);
          }
        } catch (error) {
          this.logger.error(`Error fetching email ${messageId}:`, error);
        }
      }

      this.logger.debug(`Found ${emails.length} new emails with CSV attachments since ${lastProcessedDate.toISOString()}`);
      return emails;
    } catch (error) {
      this.logger.error('Error fetching emails:', error);
      return [];
    } finally {
      await client.close();
    }
  }

  async sendReply(originalEmailId: string, replyContent: string): Promise<void> {
    if (!this.smtpTransporter) {
      this.logger.warn('SMTP not configured, cannot send reply');
      return;
    }

    try {
      // In a real implementation, you would fetch the original email to get the sender
      // For now, we'll use a placeholder
      const originalEmail = await this.getEmailById(originalEmailId);
      if (!originalEmail) {
        this.logger.error(`Original email ${originalEmailId} not found`);
        return;
      }

      const mailOptions = {
        from: this.emailConfig.imap?.username || 'noreply@tekara.com',
        to: originalEmail.from,
        subject: `Re: ${originalEmail.subject}`,
        text: replyContent,
        html: `<pre>${replyContent}</pre>`,
      };

      await this.smtpTransporter.sendMail(mailOptions);
      this.logger.log(`Reply sent for email ${originalEmailId} to ${originalEmail.from}`);
    } catch (error) {
      this.logger.error(`Error sending reply for email ${originalEmailId}:`, error);
      throw error;
    }
  }

  async markAsProcessed(emailId: string): Promise<void> {
    try {
      // Mark as processed in Redis
      await this.emailStateService.markEmailAsProcessed(emailId, {
        provider: 'imap',
        markedAt: new Date().toISOString(),
      });

      // Mark email as seen in IMAP
      await this.markEmailAsSeen(parseInt(emailId));

      this.logger.debug(`Email ${emailId} marked as processed and seen`);
    } catch (error) {
      this.logger.error(`Error marking email ${emailId} as processed:`, error);
      throw error;
    }
  }

  private async markEmailAsSeen(messageId: number): Promise<void> {
    const client = this.createImapClient();
    try {
      await client.connect();
      await client.mailboxOpen('INBOX');
      
      // Mark email as seen
      await client.messageFlagsAdd(messageId, ['\\Seen'], { uid: true });
      
      this.logger.debug(`Email ${messageId} marked as seen in IMAP`);
    } catch (error) {
      this.logger.error(`Error marking email ${messageId} as seen:`, error);
      // Don't throw here - Redis marking was successful
    } finally {
      await client.close();
    }
  }

  private async fetchEmail(client: ImapFlow, messageId: number): Promise<EmailMessage | null> {
    try {
      // Use fetchOne with proper options like in our working test
      const message = await client.fetchOne(messageId, {
        source: true,
        envelope: true,
        bodyStructure: true,
      });
      
      if (!message) {
        return null;
      }

      // Parse email headers using the correct envelope structure
      const envelope = (message as any).envelope || {};
      const from = envelope?.from?.[0]?.address || 'unknown@example.com';
      const subject = envelope?.subject || 'No Subject';
      const receivedAt = envelope?.date || new Date();

      // Parse email body and attachments using bodyStructure like in our working test
      const attachments: EmailAttachment[] = [];
      const bodyStructure = (message as any).bodyStructure;
      
      if (bodyStructure?.childNodes) {
        for (const part of bodyStructure.childNodes) {
          if (part.disposition === 'attachment' && part.dispositionParameters?.filename) {
            const fileName = part.dispositionParameters.filename;
            if (fileName.toLowerCase().endsWith('.csv')) {
              try {
                // Download attachment using the same method as our working test
                const attachmentData = await client.download(messageId, part.part);
                
                // Collect all chunks properly like in our working test
                const chunks: Buffer[] = [];
                for await (const chunk of attachmentData.content) {
                  chunks.push(chunk);
                }
                const content = Buffer.concat(chunks);
                
                attachments.push({
                  fileName: fileName,
                  contentType: part.type || 'application/octet-stream',
                  content: content,
                  size: content.length,
                });
                
                this.logger.debug(`Successfully parsed CSV attachment: ${fileName} (${content.length} bytes)`);
              } catch (error) {
                this.logger.error(`Error downloading attachment ${fileName}:`, error);
              }
            }
          }
        }
      }

      const email: EmailMessage = {
        id: messageId.toString(),
        from: from,
        subject: subject,
        receivedAt: receivedAt,
        attachments: attachments,
      };

      return email;
    } catch (error) {
      this.logger.error(`Error fetching email ${messageId}:`, error);
      return null;
    }
  }

  private async getEmailById(emailId: string): Promise<EmailMessage | null> {
    const client = this.createImapClient();
    try {
      await client.connect();
      await client.mailboxOpen('INBOX');
      
      const messageId = parseInt(emailId);
      return await this.fetchEmail(client, messageId);
    } catch (error) {
      this.logger.error(`Error getting email by ID ${emailId}:`, error);
      return null;
    } finally {
      await client.close();
    }
  }

  private hasCsvAttachments(email: EmailMessage): boolean {
    return email.attachments.some(attachment => 
      attachment.fileName.toLowerCase().endsWith('.csv')
    );
  }
}

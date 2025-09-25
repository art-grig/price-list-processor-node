import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class EmailStateService {
  private readonly logger = new Logger(EmailStateService.name);
  private readonly PROCESSED_EMAILS_KEY = 'processed_emails';
  private readonly LAST_PROCESSED_DATE_KEY = 'last_processed_email_date';
  private readonly PROCESSED_EMAIL_TTL = 86400 * 7; // 7 days

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async isEmailProcessed(emailId: string): Promise<boolean> {
    try {
      const result = await this.redis.hexists(this.PROCESSED_EMAILS_KEY, emailId);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking if email ${emailId} is processed:`, error);
      return false; // Assume not processed on error to allow retry
    }
  }

  async markEmailAsProcessed(emailId: string, metadata?: any): Promise<void> {
    try {
      const processedData = {
        emailId,
        processedAt: new Date().toISOString(),
        metadata: metadata || {},
      };

      await this.redis.hset(
        this.PROCESSED_EMAILS_KEY,
        emailId,
        JSON.stringify(processedData)
      );

      // Set TTL for the entire hash
      await this.redis.expire(this.PROCESSED_EMAILS_KEY, this.PROCESSED_EMAIL_TTL);

      this.logger.debug(`Email ${emailId} marked as processed`);
    } catch (error) {
      this.logger.error(`Error marking email ${emailId} as processed:`, error);
      throw error;
    }
  }

  async updateLastProcessedEmailDate(emailDate: Date): Promise<void> {
    try {
      await this.redis.set(
        this.LAST_PROCESSED_DATE_KEY,
        emailDate.toISOString(),
        'EX',
        this.PROCESSED_EMAIL_TTL
      );
      
      this.logger.debug(`Last processed email date updated to: ${emailDate.toISOString()}`);
    } catch (error) {
      this.logger.error('Error updating last processed email date:', error);
      throw error;
    }
  }

  async getLastProcessedEmailDate(): Promise<Date | null> {
    try {
      const dateStr = await this.redis.get(this.LAST_PROCESSED_DATE_KEY);
      return dateStr ? new Date(dateStr) : null;
    } catch (error) {
      this.logger.error('Error getting last processed email date:', error);
      return null;
    }
  }

  async getLastProcessedEmailDateWithFallback(): Promise<Date> {
    const lastDate = await this.getLastProcessedEmailDate();
    
    if (lastDate) {
      return lastDate;
    }

    // Fallback to 24 hours ago if no last processed date
    const fallbackDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.logger.warn(`No last processed date found, using fallback: ${fallbackDate.toISOString()}`);
    return fallbackDate;
  }

  async getProcessedEmailInfo(emailId: string): Promise<any | null> {
    try {
      const data = await this.redis.hget(this.PROCESSED_EMAILS_KEY, emailId);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger.error(`Error getting processed email info for ${emailId}:`, error);
      return null;
    }
  }

  async getProcessedEmailsCount(): Promise<number> {
    try {
      return await this.redis.hlen(this.PROCESSED_EMAILS_KEY);
    } catch (error) {
      this.logger.error('Error getting processed emails count:', error);
      return 0;
    }
  }

  async cleanupOldProcessedEmails(): Promise<void> {
    try {
      const allEmails = await this.redis.hgetall(this.PROCESSED_EMAILS_KEY);
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago

      const emailsToDelete: string[] = [];

      for (const [emailId, dataStr] of Object.entries(allEmails) as [string, string][]) {
        try {
          const data = JSON.parse(dataStr);
          const processedAt = new Date(data.processedAt);
          
          if (processedAt < cutoffDate) {
            emailsToDelete.push(emailId);
          }
        } catch (parseError) {
          // If we can't parse the data, consider it old and delete it
          emailsToDelete.push(emailId);
        }
      }

      if (emailsToDelete.length > 0) {
        await this.redis.hdel(this.PROCESSED_EMAILS_KEY, ...emailsToDelete);
        this.logger.log(`Cleaned up ${emailsToDelete.length} old processed emails`);
      }
    } catch (error) {
      this.logger.error('Error cleaning up old processed emails:', error);
    }
  }

  async clearAllProcessedEmails(): Promise<void> {
    try {
      await this.redis.del(this.PROCESSED_EMAILS_KEY);
      this.logger.log('Cleared all processed emails');
    } catch (error) {
      this.logger.error('Error clearing all processed emails:', error);
      throw error;
    }
  }
}

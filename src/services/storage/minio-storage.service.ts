import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'minio';
import { IStorageService } from '../../interfaces/storage-service.interface';
import { MinioConfig } from '../../config/configuration';

@Injectable()
export class MinioStorageService implements IStorageService {
  private readonly logger = new Logger(MinioStorageService.name);
  private readonly client: Client;

  constructor(private readonly minioConfig: MinioConfig) {
    this.client = new Client({
      endPoint: minioConfig.endpoint,
      port: minioConfig.port,
      useSSL: minioConfig.useSSL,
      accessKey: minioConfig.accessKey,
      secretKey: minioConfig.secretKey,
    });

    this.initializeBucket();
  }

  async uploadFile(fileName: string, content: Buffer): Promise<string> {
    try {
      const key = `${Date.now()}-${fileName}`;
      
      await this.client.putObject(
        this.minioConfig.bucketName,
        key,
        content,
        content.length,
        {
          'Content-Type': 'text/csv',
        }
      );

      this.logger.log(`File uploaded: ${key}`);
      return key;
    } catch (error) {
      this.logger.error(`Error uploading file ${fileName}:`, error);
      throw error;
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    try {
      const stream = await this.client.getObject(this.minioConfig.bucketName, key);
      
      const chunks: Buffer[] = [];
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      this.logger.error(`Error downloading file ${key}:`, error);
      throw error;
    }
  }

  async downloadFileStream(key: string): Promise<NodeJS.ReadableStream> {
    try {
      return await this.client.getObject(this.minioConfig.bucketName, key);
    } catch (error) {
      this.logger.error(`Error downloading file stream ${key}:`, error);
      throw error;
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.minioConfig.bucketName, key);
      this.logger.log(`File deleted: ${key}`);
    } catch (error) {
      this.logger.error(`Error deleting file ${key}:`, error);
      throw error;
    }
  }

  private async initializeBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.minioConfig.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.minioConfig.bucketName);
        this.logger.log(`Created bucket: ${this.minioConfig.bucketName}`);
      }
    } catch (error) {
      this.logger.error('Error initializing bucket:', error);
      throw error;
    }
  }
}

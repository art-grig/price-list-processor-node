import { registerAs } from '@nestjs/config';

export default registerAs('config', () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT, 10) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucketName: process.env.MINIO_BUCKET_NAME || 'price-lists',
  },
  
  email: {
    provider: process.env.EMAIL_PROVIDER || 'mock',
    pollingInterval: parseInt(process.env.EMAIL_POLLING_INTERVAL, 10) || 5000,
    imap: {
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT, 10) || 993,
      useSSL: process.env.IMAP_USE_SSL === 'true',
      username: process.env.IMAP_USERNAME || '',
      password: process.env.IMAP_PASSWORD || '',
    },
    pop3: {
      host: process.env.POP3_HOST || 'pop.gmail.com',
      port: parseInt(process.env.POP3_PORT, 10) || 995,
      useSSL: process.env.POP3_USE_SSL === 'true',
      username: process.env.POP3_USERNAME || '',
      password: process.env.POP3_PASSWORD || '',
    },
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      useSSL: process.env.SMTP_USE_SSL === 'true',
      username: process.env.SMTP_USERNAME || '',
      password: process.env.SMTP_PASSWORD || '',
    },
  },
  
  api: {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3001',
    timeout: parseInt(process.env.API_TIMEOUT, 10) || 30000,
  },
}));

export interface DatabaseConfig {
  host: string;
  port: number;
  password?: string;
}

export interface MinioConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucketName: string;
}

export interface EmailConfig {
  provider: 'mock' | 'imap' | 'pop3';
  pollingInterval: number;
  imap?: {
    host: string;
    port: number;
    useSSL: boolean;
    username: string;
    password: string;
  };
  pop3?: {
    host: string;
    port: number;
    useSSL: boolean;
    username: string;
    password: string;
  };
  smtp?: {
    host: string;
    port: number;
    useSSL: boolean;
    username: string;
    password: string;
  };
}

export interface ApiConfig {
  baseUrl: string;
  timeout: number;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
}
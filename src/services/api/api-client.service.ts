import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { IApiClient } from '../../interfaces/api-client.interface';
import { ApiRequest, ApiResponse } from '../../models/api-request.model';
import { ApiConfig } from '../../config/configuration';

@Injectable()
export class ApiClientService implements IApiClient {
  private readonly logger = new Logger(ApiClientService.name);
  private readonly httpClient: AxiosInstance;

  constructor(private readonly apiConfig: ApiConfig) {
    this.httpClient = axios.create({
      baseURL: apiConfig.baseUrl,
      timeout: apiConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async sendData(request: ApiRequest): Promise<ApiResponse> {
    try {
      this.logger.log(`Sending data for file: ${request.fileName}, rows: ${request.data.length}, isLast: ${request.isLast}`);
      
      const response = await this.httpClient.post('/api/process', request);
      
      this.logger.log(`API call successful for file: ${request.fileName}`);
      
      return {
        success: true,
        message: 'Data sent successfully',
        data: response.data,
      };
    } catch (error) {
      this.logger.error(`API call failed for file: ${request.fileName}:`, error);
      
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Unknown error',
        data: null,
      };
    }
  }
}

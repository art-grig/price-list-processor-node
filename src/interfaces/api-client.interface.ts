import { ApiRequest, ApiResponse } from '../models/api-request.model';

export interface IApiClient {
  sendData(request: ApiRequest): Promise<ApiResponse>;
}

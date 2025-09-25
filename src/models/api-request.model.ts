export class ApiRequest {
  fileName: string;
  senderEmail: string;
  subject: string;
  receivedAt: Date;
  data: Record<string, any>[];
  isLast: boolean;
}

export class ApiResponse {
  success: boolean;
  message: string;
  data?: any;
}

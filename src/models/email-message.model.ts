export class EmailMessage {
  id: string;
  from: string;
  subject: string;
  receivedAt: Date;
  attachments: EmailAttachment[];
}

export class EmailAttachment {
  fileName: string;
  contentType: string;
  content: Buffer;
  size: number;
}

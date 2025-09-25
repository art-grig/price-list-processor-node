export interface IStorageService {
  uploadFile(fileName: string, content: Buffer): Promise<string>;
  downloadFile(key: string): Promise<Buffer>;
  downloadFileStream(key: string): Promise<NodeJS.ReadableStream>;
  deleteFile(key: string): Promise<void>;
}

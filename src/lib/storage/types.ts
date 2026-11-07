/**
 * Where uploaded document bytes live. The database stores only the opaque
 * `key` returned by save(), so an S3-compatible provider (MinIO, Garage,
 * Cloudflare R2, AWS S3) can be added later by implementing this interface.
 */
export interface StorageProvider {
  readonly name: string;
  save(organizationId: string, originalFileName: string, data: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

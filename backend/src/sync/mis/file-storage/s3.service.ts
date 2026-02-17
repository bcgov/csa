import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as Minio from 'minio'
import { Readable } from 'stream'
import { FileStorageService } from './file-storage.service'

@Injectable()
export class S3Service extends FileStorageService {
  private readonly logger = new Logger(S3Service.name)
  private client: Minio.Client | null = null

  constructor(private readonly configService: ConfigService) {
    super()
  }

  private getClient(): Minio.Client {
    if (!this.client) {
      const uri = this.configService.get<string>('sync.s3Uri')!
      const parsed = new URL(uri)

      this.client = new Minio.Client({
        endPoint: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : undefined,
        useSSL: parsed.protocol === 'https:',
        accessKey: decodeURIComponent(parsed.username),
        secretKey: decodeURIComponent(parsed.password),
      })
    }
    return this.client
  }

  private getBucket(): string {
    return this.configService.get<string>('sync.s3Bucket')!
  }

  async download(key: string): Promise<Readable> {
    const stream = await this.getClient().getObject(this.getBucket(), key)
    this.logger.log(`Downloading ${key}`)
    return stream
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.getClient().statObject(this.getBucket(), key)
      return true
    } catch (error: unknown) {
      if (error instanceof Error && error.message?.includes('Not Found')) {
        return false
      }
      throw error
    }
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const bucket = this.getBucket()
    const client = this.getClient()

    await client.copyObject(bucket, toKey, `/${bucket}/${fromKey}`, new Minio.CopyConditions())
    await client.removeObject(bucket, fromKey)
    this.logger.log(`Moved ${fromKey} → ${toKey}`)
  }
}

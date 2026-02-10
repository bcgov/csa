import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as Minio from 'minio'
import { Readable } from 'stream'
import { FileStorageService, FileInfo } from './file-storage.service'

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

  async download(key: string): Promise<Readable> {
    const bucket = this.configService.get<string>('sync.s3Bucket')!
    const stream = await this.getClient().getObject(bucket, key)
    this.logger.log(`Downloading ${key}`)
    return stream
  }

  async getFileInfo(key: string): Promise<FileInfo> {
    const bucket = this.configService.get<string>('sync.s3Bucket')!
    const stat = await this.getClient().statObject(bucket, key)
    return { key, lastModified: stat.lastModified }
  }

  async isStale(key: string): Promise<boolean> {
    const thresholdMs =
      this.configService.get<number>('sync.misStalenessThresholdHours')! * 3_600_000
    const info = await this.getFileInfo(key)
    return Date.now() - info.lastModified.getTime() > thresholdMs
  }
}

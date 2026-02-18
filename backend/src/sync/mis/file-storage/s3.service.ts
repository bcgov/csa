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
      const { endPoint, port, useSSL, accessKey, secretKey } = this.parseS3Uri(uri)

      this.client = new Minio.Client({
        endPoint,
        port,
        useSSL,
        accessKey,
        secretKey,
      })
    }
    return this.client
  }

  /** Parse s3URI manually — `new URL()` breaks when credentials contain `/` or `@` */
  private parseS3Uri(uri: string) {
    const schemeMatch = uri.match(/^(https?):\/\/(.+)$/)
    if (!schemeMatch) throw new Error('Invalid s3URI: missing http(s):// scheme')

    const [, scheme, rest] = schemeMatch

    // Split on last @ — password may contain @
    const lastAt = rest.lastIndexOf('@')
    if (lastAt === -1) throw new Error('Invalid s3URI: expected user:pass@host')

    const credentials = rest.substring(0, lastAt)
    const hostPart = rest.substring(lastAt + 1).split('/')[0] // strip trailing path

    // Split credentials on first : — password may contain :
    const firstColon = credentials.indexOf(':')
    if (firstColon === -1) throw new Error('Invalid s3URI: expected user:pass@host')

    const accessKey = credentials.substring(0, firstColon)
    const secretKey = credentials.substring(firstColon + 1)

    // Parse host:port
    const [host, portStr] = hostPart.split(':')

    return {
      endPoint: host,
      port: portStr ? parseInt(portStr, 10) : undefined,
      useSSL: scheme === 'https',
      accessKey,
      secretKey,
    }
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
    this.logger.log(`Moved ${fromKey}->${toKey}`)
  }
}

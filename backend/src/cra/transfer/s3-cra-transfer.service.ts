import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as Minio from 'minio'
import { parseS3Uri } from 'src/common/utils'
import { CraTransferService, InboundFileInfo, TransferResult } from './cra-transfer.service'

@Injectable()
export class S3CraTransferService extends CraTransferService {
  private client: Minio.Client | null = null

  constructor(private readonly configService: ConfigService) {
    super()
  }

  private getClient(): Minio.Client {
    if (!this.client) {
      const uri = this.configService.get<string>('sync.s3Uri')!
      const { endPoint, port, useSSL, accessKey, secretKey } = parseS3Uri(uri)

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

  private getBucket(): string {
    return this.configService.get<string>('sync.s3Bucket')!
  }

  private getPrefix(): string {
    return this.configService.get<string>('cra.s3Prefix')!
  }

  async sendFile(fileName: string, fileBuffer: Buffer): Promise<TransferResult> {
    const key = `${this.getPrefix()}OUTBOUND/${fileName}`
    await this.getClient().putObject(this.getBucket(), key, fileBuffer)
    this.logger.log(`Uploaded ${key}`)
    return { success: true, fileName }
  }

  async listInboundFiles(): Promise<InboundFileInfo[]> {
    const prefix = `${this.getPrefix()}INBOUND/`
    const stream = this.getClient().listObjectsV2(this.getBucket(), prefix, true)

    return new Promise((resolve, reject) => {
      const files: InboundFileInfo[] = []

      stream.on('data', (obj) => {
        if (!obj.name) return

        const fileName = obj.name.substring(prefix.length)
        files.push({
          fileName,
          size: obj.size,
          lastModifiedAt: obj.lastModified,
        })
      })

      stream.on('end', () => resolve(files))
      stream.on('error', (err) => reject(err))
    })
  }

  async downloadInboundFile(fileName: string): Promise<Buffer> {
    const key = `${this.getPrefix()}INBOUND/${fileName}`
    const stream = await this.getClient().getObject(this.getBucket(), key)

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', (err) => reject(err))
    })
  }
}

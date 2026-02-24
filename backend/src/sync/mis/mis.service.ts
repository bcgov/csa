import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { from as copyFrom } from 'pg-copy-streams'
import { PrismaService } from 'src/common/database/prisma.service'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { FileStorageService } from './file-storage/file-storage.service'
import { MIS_FILE_CONFIGS, MIS_LAST_UPDATED_CONFIG, MisFileConfig } from './mis-file.config'

export interface MisResult {
  name: string
  rows: number
  skipped?: boolean
}

@Injectable()
export class MisService {
  private readonly logger = new Logger(MisService.name)

  constructor(
    private readonly fileStorage: FileStorageService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async ingestAll(): Promise<MisResult[]> {
    // TODO mock to remove
    if (this.configService.get<string>('MIS_INGESTION_ENABLED') === 'true') {
      this.logger.log('MIS ingestion disabled, skipping')
      return []
    }
    const prefix = this.configService.get<string>('sync.misS3Prefix') || ''

    const files: MisResult[] = []
    for (const config of MIS_FILE_CONFIGS) {
      const key = `${prefix}${config.s3Key}`
      const fileExists = await this.fileStorage.exists(key)

      if (!fileExists) {
        this.logger.warn(`${config.name}: file not found at ${key}, skipping`)
        files.push({ name: config.name, rows: 0, skipped: true })
        continue
      }

      const result = await this.ingestFile(config, prefix)
      files.push(result)
    }

    return files
  }

  async readLastUpdated(): Promise<string | null> {
    const prefix = this.configService.get<string>('sync.misS3Prefix') || ''
    const key = `${prefix}${MIS_LAST_UPDATED_CONFIG.s3Key}`
    const fileExists = await this.fileStorage.exists(key)

    if (!fileExists) {
      this.logger.warn(`last_updated: file not found at ${key}`)
      return null
    }

    const readable = await this.fileStorage.download(key)
    const chunks: Buffer[] = []
    for await (const chunk of readable) {
      chunks.push(Buffer.from(chunk))
    }
    const content = Buffer.concat(chunks).toString('utf-8').trim()

    // Parse CSV: skip header line, read value
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length < 2) {
      this.logger.warn(`last_updated: file has no data row`)
      return null
    }

    const value = lines[1]
    this.logger.log(`MIS last_updated: ${value}`)
    return value
  }

  private async ingestFile(config: MisFileConfig, prefix: string): Promise<MisResult> {
    const key = `${prefix}${config.s3Key}`
    const readable = await this.fileStorage.download(key)
    this.logger.log(`${config.name}: S3 download successful for ${key}`)

    const rows = await this.truncateAndCopy(config, readable)
    await this.moveToProcessed(key)
    this.logger.log(`${config.name}: loaded ${rows} rows via COPY`)
    return { name: config.name, rows }
  }

  private async moveToProcessed(key: string): Promise<void> {
    const date = new Date().toISOString().split('T')[0]
    const prefix = this.configService.get<string>('sync.misS3Prefix') || ''
    const filename = key.replace(prefix, '')
    const processedKey = `${prefix}PROCESSED/${date}/${filename}`

    try {
      await this.fileStorage.move(key, processedKey)
    } catch (error) {
      this.logger.warn(`Failed to move ${key} to ${processedKey}: ${error}`)
    }
  }

  private async truncateAndCopy(config: MisFileConfig, readable: Readable): Promise<number> {
    const pool = this.prisma.getPool()
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query(`TRUNCATE TABLE ${config.stagingTable}`)

      const colList = config.columns.join(', ')
      const copyQuery = `COPY ${config.stagingTable} (${colList}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')`

      this.logger.log(`COPY query: ${copyQuery}`)
      this.logger.log(`Column Count: ${config.columns.length}`)
      const copyStream = client.query(copyFrom(copyQuery))

      try {
        await pipeline(readable, copyStream)
      } catch (error) {
        this.logger.error(`COPY failed for ${config.name}: ${error.message}`)
        throw error
      }

      if (copyStream.rowCount === 0) {
        await client.query('ROLLBACK')
        throw new Error(`${config.name}: CSV has no data rows`)
      }

      await client.query('COMMIT')
      return copyStream.rowCount
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

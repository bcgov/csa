import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { from as copyFrom } from 'pg-copy-streams'
import { PrismaService } from 'src/common/database/prisma.service'
import { pacificTodayISO } from 'src/common/utils'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { FileStorageService } from './file-storage/file-storage.service'
import { MIS_FILE_CONFIGS, MisFileConfig } from './mis-file.config'

export interface MisResult {
  name: string
  rows: number
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
    if (this.configService.get<string>('MIS_INGESTION_ENABLED') === 'false') {
      this.logger.log('MIS ingestion disabled, skipping')
      return []
    }
    const prefix = this.configService.get<string>('sync.misS3Prefix') || ''

    // 1. Check file availability — all or none must be present
    const missingFiles: string[] = []
    for (const config of MIS_FILE_CONFIGS) {
      const key = `${prefix}${config.s3Key}`
      if (!(await this.fileStorage.exists(key))) {
        missingFiles.push(config.s3Key)
      }
    }

    if (missingFiles.length === MIS_FILE_CONFIGS.length) {
      this.logger.log('No MIS files found — nothing to ingest')
      return []
    }

    if (missingFiles.length > 0) {
      throw new Error(`MIS ingestion aborted: missing files [${missingFiles.join(', ')}]`)
    }

    // 2. Ingest all files
    const results: MisResult[] = []
    for (const config of MIS_FILE_CONFIGS) {
      const key = `${prefix}${config.s3Key}`
      const readable = await this.fileStorage.download(key)
      this.logger.log(`${config.name}: S3 download successful for ${key}`)
      const rows = await this.copyAndReload(config, readable)
      this.logger.log(`${config.name}: loaded ${rows} rows via COPY`)
      results.push({ name: config.name, rows })
    }

    // 3. Move all to PROCESSED
    for (const config of MIS_FILE_CONFIGS) {
      await this.moveToProcessed(`${prefix}${config.s3Key}`)
    }

    return results
  }

  private async moveToProcessed(key: string): Promise<void> {
    const date = pacificTodayISO()
    const prefix = this.configService.get<string>('sync.misS3Prefix') || ''
    const filename = key.replace(prefix, '')
    const processedKey = `${prefix}PROCESSED/${date}/${filename}`

    try {
      await this.fileStorage.move(key, processedKey)
    } catch (error) {
      this.logger.warn(`Failed to move ${key} to ${processedKey}: ${error}`)
    }
  }

  private async copyAndReload(config: MisFileConfig, readable: Readable): Promise<number> {
    const pool = this.prisma.getPool()
    const client = await pool.connect()
    const tempTable = `temp_${config.name}`
    const colList = config.columns.join(', ')

    try {
      await client.query('BEGIN')

      await client.query(
        `CREATE TEMP TABLE ${tempTable} (LIKE ${config.stagingTable} INCLUDING DEFAULTS) ON COMMIT DROP`,
      )

      const copyQuery = `COPY ${tempTable} (${colList}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')`
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

      await client.query(`TRUNCATE ${config.stagingTable}`)
      await client.query(
        `INSERT INTO ${config.stagingTable} (${colList}, ingested_at) SELECT ${colList}, NOW() FROM ${tempTable}`,
      )

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

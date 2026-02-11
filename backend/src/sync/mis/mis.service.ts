import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { from as copyFrom } from 'pg-copy-streams'
import { PrismaService } from 'src/common/database/prisma.service'
import { FileStorageService } from './file-storage/file-storage.service'
import { MisFileConfig, MIS_FILE_CONFIGS } from './mis-file.config'

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
    const prefix = this.configService.get<string>('sync.misS3Prefix') || ''

    // Check staleness — MockFileStorageService always returns false
    const staleFiles: string[] = []
    for (const config of MIS_FILE_CONFIGS) {
      const key = `${prefix}${config.s3Key}`
      const stale = await this.fileStorage.isStale(key)
      if (stale) staleFiles.push(config.name)
    }
    if (staleFiles.length > 0) {
      throw new Error(`MIS files are stale: ${staleFiles.join(', ')}`)
    }

    const results = await Promise.all(
      MIS_FILE_CONFIGS.map((config) => this.ingestFile(config, prefix)),
    )

    return results
  }

  private async ingestFile(config: MisFileConfig, prefix: string): Promise<MisResult> {
    const key = `${prefix}${config.s3Key}`
    const readable = await this.fileStorage.download(key)
    const rows = await this.truncateAndCopy(config, readable)

    this.logger.log(`${config.name}: loaded ${rows} rows via COPY`)
    return { name: config.name, rows }
  }

  private async truncateAndCopy(config: MisFileConfig, readable: Readable): Promise<number> {
    const schema = this.configService.get<string>('sync.postgresSchema')!
    const pool = this.prisma.getPool()
    const client = await pool.connect()

    try {
      await client.query('BEGIN')
      await client.query(`TRUNCATE TABLE ${schema}.${config.stagingTable}`)

      const colList = config.columns.join(', ')
      const copyQuery = `COPY ${schema}.${config.stagingTable} (${colList}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')`

      const copyStream = client.query(copyFrom(copyQuery))
      await pipeline(readable, copyStream)

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

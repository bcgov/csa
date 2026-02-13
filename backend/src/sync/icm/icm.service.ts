import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'
import { IcmApiRecord, IcmDataSource } from './data-source/icm-data-source'
import { IcmApiConfig } from './icm.config'

export const BATCH_SIZE = 1000

export interface IcmResult {
  name: string
  fetched: number
  upserted: number
}

@Injectable()
export class IcmService {
  private readonly logger = new Logger(IcmService.name)

  constructor(
    private readonly icmDataSource: IcmDataSource,
    private readonly prisma: PrismaService,
  ) {}

  async ingestResource(config: IcmApiConfig, lastUpdated?: Date): Promise<IcmResult> {
    const records = await this.icmDataSource.fetchAll(config, lastUpdated)

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      await this.batchUpsert(config, batch)
    }

    this.logger.log(`${config.name}: fetched=${records.length}, upserted=${records.length}`)
    return { name: config.name, fetched: records.length, upserted: records.length }
  }

  // Ingest all ICM API endpoints sequentially.
  async ingestAll(configs: IcmApiConfig[], lastUpdated?: Date): Promise<IcmResult[]> {
    const results: IcmResult[] = []
    for (const config of configs) {
      const result = await this.ingestResource(config, lastUpdated)
      results.push(result)
    }

    return results
  }

  // Batch upsert records into the staging table.
  private async batchUpsert(config: IcmApiConfig, records: IcmApiRecord[]): Promise<void> {
    const table = config.stagingTable
    const { fieldMap, primaryKey } = config

    // Build multi-row parameterized INSERT ON CONFLICT
    const allValues: unknown[] = []
    const valueGroups: string[] = []

    for (const record of records) {
      const placeholders = fieldMap.map((entry) => {
        const raw = record[entry.sourceLabel]
        allValues.push(raw === '' || raw == null ? null : raw)
        return `$${allValues.length}`
      })
      valueGroups.push(`(${placeholders.join(', ')}, NOW())`)
    }

    const colList = fieldMap.map((e) => e.sourceField).join(', ')
    const updateSet = fieldMap
      .filter((e) => e.sourceField !== primaryKey)
      .map((e) => `${e.sourceField} = EXCLUDED.${e.sourceField}`)
      .join(', ')

    const sql = `
      INSERT INTO ${table} (${colList}, ingested_at)
      VALUES ${valueGroups.join(', ')}
      ON CONFLICT (${primaryKey}) DO UPDATE SET
        ${updateSet},
        ingested_at = NOW()
    `

    await this.prisma.$executeRawUnsafe(sql, ...allValues)
  }
}

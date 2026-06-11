import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/common/database/prisma.service'
import { formatIcmTimestamp, parseCalendarDate } from 'src/common/utils'
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
    const fetched = await this.icmDataSource.fetchAll(config, lastUpdated)
    const records = config.filterItems ? config.filterItems(fetched) : fetched

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

  // Batch upsert records into the staging table using unnest arrays.
  private async batchUpsert(config: IcmApiConfig, records: IcmApiRecord[]): Promise<void> {
    const { stagingTable, fieldMap, primaryKey } = config

    // Build one array per column from the field map
    const arrays = fieldMap.map((entry) =>
      records.map((record) => {
        const raw = record[entry.sourceLabel]
        if (raw === '' || raw == null) return null
        if (entry.dbType === 'date') {
          return parseCalendarDate(String(raw))
        }
        if (entry.dbType === 'timestamp') {
          return formatIcmTimestamp(String(raw))
        }
        return raw
      }),
    )

    const colList = fieldMap.map((e) => e.sourceField).join(', ')
    const selectList = fieldMap.map((e) => `t.${e.sourceField}`).join(', ')
    const unnestParams = fieldMap.map((e, i) => `$${i + 1}::${e.dbType ?? 'text'}[]`).join(', ')
    const updateSet = fieldMap
      .filter((e) => e.sourceField !== primaryKey)
      .map((e) => `${e.sourceField} = EXCLUDED.${e.sourceField}`)
      .join(', ')

    // Fields eligible for change detection: exclude PK and excludeFromChangeDetection fields
    const changeDetectFields = fieldMap.filter(
      (e) => e.sourceField !== primaryKey && !e.excludeFromChangeDetection,
    )

    const hasChangeDetection = changeDetectFields.length > 0
    const oldTuple = changeDetectFields.map((e) => `${stagingTable}.${e.sourceField}`).join(', ')
    const newTuple = changeDetectFields.map((e) => `EXCLUDED.${e.sourceField}`).join(', ')

    const dataChangedAtClause = hasChangeDetection
      ? `CASE
          WHEN (${oldTuple}) IS DISTINCT FROM (${newTuple})
          THEN NOW()
          ELSE ${stagingTable}.data_changed_at
        END`
      : 'NOW()'

    const sql = `
      INSERT INTO ${stagingTable} (${colList}, ingested_at, data_changed_at)
      SELECT ${selectList}, NOW(), NOW()
      FROM unnest(${unnestParams})
      AS t(${colList})
      ON CONFLICT (${primaryKey}) DO UPDATE SET
        ${updateSet},
        ingested_at = NOW(),
        data_changed_at = ${dataChangedAtClause}
    `

    await this.prisma.$executeRawUnsafe(sql, ...arrays)
  }
}

import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { IcmApiConfig } from '../icm.config'
import { IcmApiRecord, IcmContactUpdatePayload, IcmDataSource } from './icm-data-source'

@Injectable()
export class MockIcmDataSource extends IcmDataSource {
  private readonly logger = new Logger(MockIcmDataSource.name)

  async fetchAll(config: IcmApiConfig, lastUpdated?: Date): Promise<IcmApiRecord[]> {
    const mockDir = path.join(__dirname, '..', '..', 'mock-data', 'icm')
    const mockFile = path.join(mockDir, `${config.name}.json`)

    if (!fs.existsSync(mockFile)) {
      this.logger.log(`Mock file not found for ${config.name}: ${mockFile}`)
      return []
    }

    const raw = fs.readFileSync(mockFile, 'utf-8')
    const parsed = JSON.parse(raw)
    const items: IcmApiRecord[] = parsed?.items ?? []

    if (!lastUpdated) {
      this.logger.log(`Loaded ${items.length} mock records for ${config.name}`)
      return items
    }

    const labels = Array.isArray(config.cursorLabel) ? config.cursorLabel : [config.cursorLabel]

    const filtered = items.filter((record) => {
      const cursorDates = labels
        .map((label) => record[label])
        .filter((v): v is string => typeof v === 'string')
        .map((dateStr) => this.parseIcmDate(dateStr))
        .filter((d): d is Date => d !== null)

      if (cursorDates.length === 0) return true
      return cursorDates.some((d) => d > lastUpdated)
    })

    this.logger.log(
      `Loaded ${filtered.length}/${items.length} mock records for ${config.name} (after ${lastUpdated.toISOString()})`,
    )
    return filtered
  }

  async updateContacts(contacts: IcmContactUpdatePayload[]): Promise<void> {
    this.logger.log(`Mock: would sync ${contacts.length} contacts to ICM`)
  }

  private parseIcmDate(dateStr: string): Date | null {
    // MM/DD/YYYY HH:MM:SS
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/)
    if (!match) return null
    const [, month, day, year, hours, minutes, seconds] = match
    return new Date(+year, +month - 1, +day, +hours, +minutes, +seconds)
  }
}

import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { IcmApiConfig } from '../icm.config'
import { IcmApiRecord, IcmDataSource } from './icm-data-source'

@Injectable()
export class MockIcmDataSource extends IcmDataSource {
  private readonly logger = new Logger(MockIcmDataSource.name)

  async fetchAll(config: IcmApiConfig, lastUpdated?: Date): Promise<IcmApiRecord[]> {
    const mockDir = path.join(__dirname, '..', '..', 'mock-data', 'icm', 'mock')
    const mockFile = path.join(mockDir, `${config.name}.json`)

    if (!fs.existsSync(mockFile)) {
      this.logger.warn(`Mock file not found for ${config.name}: ${mockFile}`)
      return []
    }

    const raw = fs.readFileSync(mockFile, 'utf-8')
    const parsed = JSON.parse(raw)
    const items: IcmApiRecord[] = parsed?.items ?? []

    if (!lastUpdated) {
      this.logger.log(`Loaded ${items.length} mock records for ${config.name}`)
      return items
    }

    const filtered = items.filter((record) => {
      const dateStr = record[config.cursorLabel]
      if (typeof dateStr !== 'string') return true
      const parsed = this.parseIcmDate(dateStr)
      return !parsed || parsed > lastUpdated
    })

    this.logger.log(
      `Loaded ${filtered.length}/${items.length} mock records for ${config.name} (after ${lastUpdated.toISOString()})`,
    )
    return filtered
  }

  private parseIcmDate(dateStr: string): Date | null {
    // MM/DD/YYYY HH:MM:SS
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/)
    if (!match) return null
    const [, month, day, year, hours, minutes, seconds] = match
    return new Date(+year, +month - 1, +day, +hours, +minutes, +seconds)
  }
}

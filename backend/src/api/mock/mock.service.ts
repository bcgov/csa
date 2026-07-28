import { Injectable, Logger } from '@nestjs/common'

import { existsSync, readdirSync, readFileSync } from 'fs'

import { join } from 'path'

@Injectable()
export class MockService {
  private readonly logger = new Logger(MockService.name)

  private readonly dataDir = join(__dirname, 'data')

  getFile(filename: string): unknown {
    if (/[^a-zA-Z0-9_-]/.test(filename)) {
      this.logger.log(`Invalid mock filename rejected: ${filename}`)
      return null
    }

    const filePath = join(this.dataDir, `${filename}.json`)

    if (!existsSync(filePath)) {
      this.logger.log(`Mock file not found: ${filePath}`)

      return null
    }

    const content = readFileSync(filePath, 'utf-8')

    return JSON.parse(content)
  }

  listFiles(): string[] {
    this.logger.debug(`Listing files from ${this.dataDir}`)
    if (!existsSync(this.dataDir)) {
      return []
    }

    return readdirSync(this.dataDir)
      .filter((file) => file.endsWith('.json'))

      .map((file) => file.replace('.json', ''))
  }
}

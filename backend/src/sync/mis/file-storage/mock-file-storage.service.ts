import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { FileStorageService } from './file-storage.service'

@Injectable()
export class MockFileStorageService extends FileStorageService {
  private readonly logger = new Logger(MockFileStorageService.name)

  private getMockPath(key: string): string {
    const filename = path.basename(key)
    return path.join(__dirname, '..', '..', 'mock-data', 'mis', 'mock', filename)
  }

  async download(key: string): Promise<Readable> {
    const mockFile = this.getMockPath(key)

    if (!fs.existsSync(mockFile)) {
      throw new Error(`Mock file not found: ${mockFile}`)
    }

    this.logger.log(`Loaded mock file ${path.basename(key)}`)
    return fs.createReadStream(mockFile)
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.getMockPath(key))
  }

  async move(_fromKey: string, _toKey: string): Promise<void> {
    this.logger.log('Mock: skipping file move')
  }
}

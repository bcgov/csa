import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { FileStorageService, FileInfo } from './file-storage.service'

@Injectable()
export class MockFileStorageService extends FileStorageService {
  private readonly logger = new Logger(MockFileStorageService.name)

  async download(key: string): Promise<Readable> {
    const filename = path.basename(key)
    const mockFile = path.join(__dirname, '..', '..', 'mock-data', 'mis', 'mock', filename)

    if (!fs.existsSync(mockFile)) {
      throw new Error(`Mock file not found: ${mockFile}`)
    }

    this.logger.log(`Loaded mock file ${filename}`)
    return fs.createReadStream(mockFile)
  }

  async getFileInfo(key: string): Promise<FileInfo> {
    return { key, lastModified: new Date() }
  }

  async isStale(_key: string): Promise<boolean> {
    return false
  }
}

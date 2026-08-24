import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { FileStorageService } from './file-storage.service'

@Injectable()
export class LocalFileStorageService extends FileStorageService {
  private readonly logger = new Logger(LocalFileStorageService.name)

  constructor(private readonly basePath: string) {
    super()
  }

  private getFilePath(key: string): string {
    const filename = path.basename(key)
    return path.join(this.basePath, filename)
  }

  async download(key: string): Promise<Readable> {
    const filePath = this.getFilePath(key)

    if (!fs.existsSync(filePath)) {
      throw new Error(`MIS file not found: ${filePath}`)
    }

    this.logger.log(`Loaded local MIS file ${path.basename(key)}`)
    return fs.createReadStream(filePath)
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.getFilePath(key))
  }

  async move(_fromKey: string, _toKey: string): Promise<void> {
    this.logger.log('Local dev: skipping MIS file move after ingest')
  }
}

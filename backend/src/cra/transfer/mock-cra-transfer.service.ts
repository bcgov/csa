import { Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import { CraTransferService, InboundFileInfo, TransferResult } from './cra-transfer.service'

@Injectable()
export class MockCraTransferService extends CraTransferService {
  constructor(private readonly mockBasePath: string) {
    super()
  }

  async sendFile(fileName: string, fileBuffer: Buffer): Promise<TransferResult> {
    const outboundDir = path.join(this.mockBasePath, 'outbound')
    await fsp.mkdir(outboundDir, { recursive: true })
    await fsp.writeFile(path.join(outboundDir, fileName), fileBuffer)
    this.logger.log(`Wrote outbound file ${fileName}`)
    return { success: true, fileName }
  }

  async listInboundFiles(): Promise<InboundFileInfo[]> {
    const inboundDir = path.join(this.mockBasePath, 'inbound')
    if (!fs.existsSync(inboundDir)) {
      return []
    }

    const entries = await fsp.readdir(inboundDir, { withFileTypes: true })
    const files = entries.filter((entry) => !entry.isDirectory())

    const results: InboundFileInfo[] = []
    for (const file of files) {
      const filePath = path.join(inboundDir, file.name)
      const stats = await fsp.stat(filePath)
      results.push({
        fileName: file.name,
        size: stats.size,
        lastModifiedAt: stats.mtime,
      })
    }

    this.logger.log(`Found ${results.length} inbound file(s)`)
    return results
  }

  async downloadInboundFile(fileName: string): Promise<Buffer> {
    const filePath = path.join(this.mockBasePath, 'inbound', fileName)
    return fsp.readFile(filePath)
  }

}

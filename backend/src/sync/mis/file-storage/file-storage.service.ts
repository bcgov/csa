import { Readable } from 'stream'

export interface FileInfo {
  key: string
  lastModified: Date
}

export abstract class FileStorageService {
  abstract download(key: string): Promise<Readable>
  abstract getFileInfo(key: string): Promise<FileInfo>
  abstract isStale(key: string): Promise<boolean>
}

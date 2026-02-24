import { Readable } from 'stream'

export abstract class FileStorageService {
  abstract download(key: string): Promise<Readable>
  abstract exists(key: string): Promise<boolean>
  abstract move(fromKey: string, toKey: string): Promise<void>
}

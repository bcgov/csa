import { existsSync, mkdirSync } from 'fs';
import { CreateFileTransferObj } from '../../interfaces/response-file.interface';

const { FILE_STORAGE_PATH } = process.env

export const returnDownloadableFile = (dbFiles: any[], remoteListFiles: any[]) => {
    return remoteListFiles.filter(
        remoteFile => !dbFiles.some(dbFile => dbFile.fileName === remoteFile.fileName)
    )[0]

}


export const createDirIfNotExist = (dirPath: string) => {
    console.log('Checking if directory exists at path:', dirPath)
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
        console.log('Directory created at path:', dirPath)
    }
}

export const createCurrentDate = (): Date => {
    return new Date()
}

export const createFileTransferObj = (fileInfo: CreateFileTransferObj) => {
  return {
    batchId: fileInfo.batchId,
    destinationId: fileInfo.destinationId,
    direction: fileInfo.direction,
    fileName: fileInfo.fileName,
    fileSize: fileInfo.fileSize,
    deliveredAt: createCurrentDate(),
    
  }
}
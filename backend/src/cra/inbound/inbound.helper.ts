import { existsSync, mkdirSync } from 'fs'
import { CRA_DATA_HANDLING_CONSTANT } from '../cra.constant'
import type { CraResDetail } from './inbound.interface'

const { ERROR_MESSAGE } = CRA_DATA_HANDLING_CONSTANT
const { FILE_STAT_MESSAGE, REJECT_CODE } = ERROR_MESSAGE

export const returnDownloadableFile = (dbFiles: any[], remoteListFiles: any[]) => {
  return remoteListFiles.filter(
    (remoteFile) => !dbFiles.some((dbFile) => dbFile.fileName === remoteFile.fileName),
  )[0]
}

export const createDirIfNotExist = (dirPath: string) => {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

export const createCurrentDate = (): Date => {
  return new Date()
}

export const getBatchSystemCommentByCode = (fileStatCd: string): string => {
  if (FILE_STAT_MESSAGE[fileStatCd]) {
    return FILE_STAT_MESSAGE[fileStatCd]
  }
  return 'Unknown error code'
}

export const returnAllRejectCode = (detail: CraResDetail): string[] => {
  const rejectCodes: string[] = []
  const keys = ['rejectCd1', 'rejectCd2', 'rejectCd3', 'rejectCd4', 'rejectCd5'] as const
  for (const key of keys) {
    if (detail[key]) {
      rejectCodes.push(detail[key])
    }
  }
  return rejectCodes
}

export const getErrorMessageByRejectCode = (rejectCodes: string[]): string => {
  const errorMessages: string[] = []
  for (const rejectCode of rejectCodes) {
    if (REJECT_CODE[rejectCode]) {
      errorMessages.push(REJECT_CODE[rejectCode])
    }
  }

  return errorMessages.join('; ')
}

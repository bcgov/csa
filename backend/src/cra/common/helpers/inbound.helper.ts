import { existsSync, mkdirSync } from 'fs'
import { CRA_DATA_HANDLING_CONSTANT } from '../constants/cra.constant'

const { FILE_STAT_CODE, ERROR_MESSAGE } = CRA_DATA_HANDLING_CONSTANT
const { FILE_STAT_MESSAGE, REJECT_MESSAGE_BY_CODE } = ERROR_MESSAGE
const {
  FILE_NOT_SET,
  FILE_OK,
  INVALID_EMPTY_FILE,
  INVALID_RECORD_COUNT,
  INVALID_NO_HEADER,
  INVALID_NO_DETAILS,
  INVALID_NO_TRAILER,
  RECS_OUT_OF_SEQ,
} = FILE_STAT_CODE

export const returnDownloadableFile = (dbFiles: any[], remoteListFiles: any[]) => {
  return remoteListFiles.filter(
    (remoteFile) => !dbFiles.some((dbFile) => dbFile.fileName === remoteFile.fileName),
  )[0]
}

export const createDirIfNotExist = (dirPath: string) => {
  console.log('Checking if directory exists at path:', dirPath)
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
    console.log('Directory created at path:', dirPath)
  }
}

export const createCurrentDate = (): Date => {
  return new Date()
}

export const getBatchSystemCommentByCode = (fileStatCd: number): string => {
  switch (fileStatCd) {
    case FILE_NOT_SET:
      return FILE_STAT_MESSAGE[FILE_NOT_SET]
    case FILE_OK:
      return FILE_STAT_MESSAGE[FILE_OK]
    case INVALID_EMPTY_FILE:
      return FILE_STAT_MESSAGE[INVALID_EMPTY_FILE]
    case INVALID_RECORD_COUNT:
      return FILE_STAT_MESSAGE[INVALID_RECORD_COUNT]
    case INVALID_NO_HEADER:
      return FILE_STAT_MESSAGE[INVALID_NO_HEADER]
    case INVALID_NO_DETAILS:
      return FILE_STAT_MESSAGE[INVALID_NO_DETAILS]
    case INVALID_NO_TRAILER:
      return FILE_STAT_MESSAGE[INVALID_NO_TRAILER]
    case RECS_OUT_OF_SEQ:
      return FILE_STAT_MESSAGE[RECS_OUT_OF_SEQ]
  }
  return 'Unknown error code'
}

export const returnAllRejectCode = (eachDetails: object) => {
  const rejectCodes = []
  for (const key in eachDetails) {
    if (key.startsWith('rejectCd') && eachDetails[key]) {
      rejectCodes.push(eachDetails[key])
    }
  }
  return rejectCodes
}

export const getErrorMessageByRejectCode = (rejectCodes: string[]): string => {
  const errorMessages = []
  for (const rejectCode of rejectCodes) {
    if (REJECT_MESSAGE_BY_CODE[rejectCode]) {
      errorMessages.push(REJECT_MESSAGE_BY_CODE[rejectCode])
    }
  }

  return errorMessages.join('; ')
}

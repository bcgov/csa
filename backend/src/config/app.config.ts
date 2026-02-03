import { registerAs } from '@nestjs/config'

export const appConfig = registerAs('app', () => {
  const fileTransferServiceUrl = process.env.FILE_TRANSFER_SERVICE_URL
  const fileStoragePath = process.env.FILE_STORAGE_PATH

  if (!fileTransferServiceUrl) {
    throw new Error('FILE_TRANSFER_SERVICE_URL is required')
  }
  if (!fileStoragePath) {
    throw new Error('FILE_STORAGE_PATH is required')
  }

  return {
    fileTransferServiceUrl,
    fileStoragePath,
  }
})

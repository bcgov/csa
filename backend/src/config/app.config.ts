import { registerAs } from '@nestjs/config'

export type DeployEnv = 'dev' | 'test' | 'prod'

const VALID_DEPLOY_ENVS: DeployEnv[] = ['dev', 'test', 'prod']

export const appConfig = registerAs('app', () => {
  const fileTransferServiceUrl = process.env.FILE_TRANSFER_SERVICE_URL
  const fileStoragePath = process.env.FILE_STORAGE_PATH
  const deployEnv = (process.env.DEPLOY_ENV || 'dev') as DeployEnv

  if (!fileTransferServiceUrl) {
    throw new Error('FILE_TRANSFER_SERVICE_URL is required')
  }
  if (!fileStoragePath) {
    throw new Error('FILE_STORAGE_PATH is required')
  }
  if (!VALID_DEPLOY_ENVS.includes(deployEnv)) {
    throw new Error(`DEPLOY_ENV must be one of: ${VALID_DEPLOY_ENVS.join(', ')}`)
  }

  return {
    fileTransferServiceUrl,
    fileStoragePath,
    deployEnv,
  }
})

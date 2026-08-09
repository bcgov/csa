import { registerAs } from '@nestjs/config'

export type DeployEnv = 'local' | 'dev' | 'test' | 'prod'

const VALID_DEPLOY_ENVS: DeployEnv[] = ['local', 'dev', 'test', 'prod']

export function getDeployEnv(): DeployEnv {
  const deployEnv = process.env.DEPLOY_ENV
  if (!deployEnv) {
    throw new Error('DEPLOY_ENV is required')
  }
  if (!VALID_DEPLOY_ENVS.includes(deployEnv as DeployEnv)) {
    throw new Error(`DEPLOY_ENV must be one of: ${VALID_DEPLOY_ENVS.join(', ')}`)
  }
  return deployEnv as DeployEnv
}

export const appConfig = registerAs('app', () => {
  const fileTransferServiceUrl = process.env.FILE_TRANSFER_SERVICE_URL
  const fileStoragePath = process.env.FILE_STORAGE_PATH
  const deployEnv = getDeployEnv()

  if (!fileTransferServiceUrl) {
    throw new Error('FILE_TRANSFER_SERVICE_URL is required')
  }
  if (!fileStoragePath) {
    throw new Error('FILE_STORAGE_PATH is required')
  }

  return {
    fileTransferServiceUrl,
    fileStoragePath,
    deployEnv,
  }
})

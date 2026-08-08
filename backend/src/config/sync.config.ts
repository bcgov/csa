import { registerAs } from '@nestjs/config'
import type { DeployEnv } from './app.config'

export const syncConfig = registerAs('sync', () => {
  const deployEnv = (process.env.DEPLOY_ENV || 'local') as DeployEnv
  const isLocal = deployEnv === 'local'
  const icmCursorLookbackDays = parseInt(process.env.ICM_CURSOR_LOOKBACK_DAYS || '2', 10)
  const eligibilityLookbackDays = parseInt(process.env.ELIGIBILITY_LOOKBACK_DAYS || '2', 10)
  const rawTimeout = parseInt(process.env.ICM_REQUEST_TIMEOUT_MS || '30000', 10)
  const icmRequestTimeoutMs = Number.isNaN(rawTimeout) ? 30000 : rawTimeout

  if (!isLocal) {
    if (!process.env.s3URI) {
      throw new Error('s3URI is required when DEPLOY_ENV is not local')
    }
    if (!process.env.s3BucketName) {
      throw new Error('s3BucketName is required when DEPLOY_ENV is not local')
    }
  }

  return {
    isLocal,
    icmCursorLookbackDays,
    icmRequestTimeoutMs,
    eligibilityLookbackDays,
    s3Uri: process.env.s3URI || '',
    s3Bucket: process.env.s3BucketName || '',
    misS3Prefix: process.env.MIS_S3_PREFIX || 'csas3/',
  }
})

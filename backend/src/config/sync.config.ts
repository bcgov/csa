import { registerAs } from '@nestjs/config'
import { getDeployEnv } from './app.config'

export const syncConfig = registerAs('sync', () => {
  const isLocal = getDeployEnv() === 'local'

  const icmCursorLookbackDaysRaw = process.env.ICM_CURSOR_LOOKBACK_DAYS
  if (!icmCursorLookbackDaysRaw) {
    throw new Error('ICM_CURSOR_LOOKBACK_DAYS is required')
  }
  const icmCursorLookbackDays = parseInt(icmCursorLookbackDaysRaw, 10)
  if (Number.isNaN(icmCursorLookbackDays)) {
    throw new Error('ICM_CURSOR_LOOKBACK_DAYS must be an integer')
  }

  const eligibilityLookbackDaysRaw = process.env.ELIGIBILITY_LOOKBACK_DAYS
  if (!eligibilityLookbackDaysRaw) {
    throw new Error('ELIGIBILITY_LOOKBACK_DAYS is required')
  }
  const eligibilityLookbackDays = parseInt(eligibilityLookbackDaysRaw, 10)
  if (Number.isNaN(eligibilityLookbackDays)) {
    throw new Error('ELIGIBILITY_LOOKBACK_DAYS must be an integer')
  }

  const icmRequestTimeoutMsRaw = process.env.ICM_REQUEST_TIMEOUT_MS
  if (!icmRequestTimeoutMsRaw) {
    throw new Error('ICM_REQUEST_TIMEOUT_MS is required')
  }
  const icmRequestTimeoutMs = parseInt(icmRequestTimeoutMsRaw, 10)
  if (Number.isNaN(icmRequestTimeoutMs)) {
    throw new Error('ICM_REQUEST_TIMEOUT_MS must be an integer')
  }

  const misS3Prefix = process.env.MIS_S3_PREFIX
  if (!misS3Prefix) {
    throw new Error('MIS_S3_PREFIX is required')
  }

  let s3Uri = ''
  let s3Bucket = ''
  if (!isLocal) {
    if (!process.env.s3URI) {
      throw new Error('s3URI is required when DEPLOY_ENV is not local')
    }
    if (!process.env.s3BucketName) {
      throw new Error('s3BucketName is required when DEPLOY_ENV is not local')
    }
    s3Uri = process.env.s3URI
    s3Bucket = process.env.s3BucketName
  }

  return {
    isLocal,
    icmCursorLookbackDays,
    icmRequestTimeoutMs,
    eligibilityLookbackDays,
    s3Uri,
    s3Bucket,
    misS3Prefix,
  }
})

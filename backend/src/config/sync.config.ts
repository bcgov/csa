import { registerAs } from '@nestjs/config'

export const syncConfig = registerAs('sync', () => {
  const useMockData = process.env.USE_MOCK_DATA === 'true'
  const icmCursorLookbackDays = parseInt(process.env.ICM_CURSOR_LOOKBACK_DAYS || '2', 10)
  const eligibilityLookbackDays = parseInt(process.env.ELIGIBILITY_LOOKBACK_DAYS || '2', 10)
  const rawTimeout = parseInt(process.env.ICM_REQUEST_TIMEOUT_MS || '30000', 10)
  const icmRequestTimeoutMs = Number.isNaN(rawTimeout) ? 30000 : rawTimeout
  // S3/MinIO config
  // only required when not using mock data
  if (!useMockData) {
    if (!process.env.s3URI) {
      throw new Error('s3URI is required when USE_MOCK_DATA is not true')
    }
    if (!process.env.s3BucketName) {
      throw new Error('s3BucketName is required when USE_MOCK_DATA is not true')
    }
  }

  return {
    useMockData,
    icmCursorLookbackDays,
    icmRequestTimeoutMs,
    eligibilityLookbackDays,
    s3Uri: process.env.s3URI || '',
    s3Bucket: process.env.s3BucketName || '',
    misS3Prefix: process.env.MIS_S3_PREFIX || 'csas3/',
  }
})

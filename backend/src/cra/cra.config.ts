import { registerAs } from '@nestjs/config'

export const craConfig = registerAs('cra', () => {
  const isProduction = process.env.NODE_ENV === 'production'

  return {
    environmentCode: isProduction ? 'PCSAIN' : 'ACSAIN',
    fileTypeCode: isProduction ? 'PAPL' : 'AAPL',
  }
})

import { Controller, Get, Res, HttpException, HttpStatus } from '@nestjs/common'
import type { Response } from 'express'
import { register } from 'src/common/middleware/prom'

@Controller('metrics')
export class MetricsController {
  @Get()
  async getMetrics(@Res() res: Response) {
    try {
      const appMetrics = await register.metrics()
      res.end(appMetrics)
    } catch (error) {
      console.error('Error collecting metrics:', error)
      throw new HttpException('Failed to collect metrics', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}

import { Controller, Get, Res, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Response } from 'express'
import { register } from 'src/common/middleware/prom'

@Controller('metrics')
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name)

  @Get()
  async getMetrics(@Res() res: Response) {
    try {
      const appMetrics = await register.metrics()
      res.end(appMetrics)
    } catch (error) {
      this.logger.error('Error collecting metrics:', error)
      throw new HttpException('Failed to collect metrics', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}

import type { MiddlewareConsumer } from '@nestjs/common'
import { Module, RequestMethod } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TerminusModule } from '@nestjs/terminus'
import 'dotenv/config'
import { PrismaService } from 'src/common/database/prisma.service'
import { HTTPLoggerMiddleware } from '../common/middleware/req.res.logger'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ApplicantsModule } from './applicants/applicants.module'
import { HealthController } from './health/health.controller'
import { MetricsController } from './metrics/metrics.controller'

@Module({
  imports: [ConfigModule.forRoot(), TerminusModule, ApplicantsModule],
  controllers: [AppController, MetricsController, HealthController],
  providers: [AppService, PrismaService],
})
export class ApiModule {
  // let's add a middleware on all routes
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(HTTPLoggerMiddleware)
      .exclude(
        { path: 'metrics', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
      )
      .forRoutes('*')
  }
}

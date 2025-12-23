import 'dotenv/config'
import type { MiddlewareConsumer } from '@nestjs/common'
import { Module, RequestMethod } from '@nestjs/common'
import { HTTPLoggerMiddleware } from '../common/middleware/req.res.logger'
import { PrismaService } from 'src/common/database/prisma.service'
import { ConfigModule } from '@nestjs/config'
import { UsersModule } from './users/users.module'
import { AppService } from './app.service'
import { AppController } from './app.controller'
import { MetricsController } from './metrics/metrics.controller'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController } from './health/health.controller'

@Module({
  imports: [ConfigModule.forRoot(), TerminusModule, UsersModule],
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

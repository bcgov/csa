import type { MiddlewareConsumer } from '@nestjs/common'
import { Module, RequestMethod } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TerminusModule } from '@nestjs/terminus'
import { PrismaService } from 'src/common/database/prisma.service'
import { appConfig } from 'src/config/app.config'
import { HTTPLoggerMiddleware } from '../common/middleware/req.res.logger'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { BatchesModule } from './batches/batches.module'
import { ContactsModule } from './contacts/contacts.module'
import { HealthController } from './health/health.controller'
import { MetricsController } from './metrics/metrics.controller'
import { MockModule } from './mock/mock.module'
import { StatusUpdateModule } from './status_update/status-update.module'

const enableMockApi = process.env.NODE_ENV !== 'production'
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    TerminusModule,
    ContactsModule,
    StatusUpdateModule,
    BatchesModule,
    ...(enableMockApi ? [MockModule] : []),
  ],
  controllers: [AppController, MetricsController, HealthController],
  providers: [AppService, PrismaService],
})
export class ApiModule {
  // let's add a middleware on all routes
  //TODO: remove the unused routes
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

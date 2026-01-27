import type { MiddlewareConsumer } from '@nestjs/common'
import { Module, RequestMethod } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TerminusModule } from '@nestjs/terminus'
import 'dotenv/config'
import { PrismaService } from 'src/common/database/prisma.service'
import { HTTPLoggerMiddleware } from '../common/middleware/req.res.logger'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ContactsModule } from './contacts/contacts.module'
import { HealthController } from './health/health.controller'
import { MetricsController } from './metrics/metrics.controller'
import { CraDataHandlingModule } from 'src/cra-data-handling/cra-data-handling.module'
import '../common/config/server.config'
import { DataSyncModule } from 'src/data-sync/data-sync.module' 
import { MockModule } from './mock/mock.module'

const enableMockApi = process.env.ENABLE_MOCK_API === 'true'
@Module({
  imports: [
    ConfigModule.forRoot(),
    TerminusModule,
    ContactsModule,
    ...(enableMockApi ? [MockModule] : []),
  ],
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

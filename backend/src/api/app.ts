import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import {
  METRICS_ALIAS_PATH,
  metricsMiddleware,
  servePrometheusMetrics,
} from 'src/common/middleware/prom'
import { customLogger } from '../common/logger/logger.config'
import { ApiModule } from './api.module'

export async function bootstrap() {
  const app: NestExpressApplication = await NestFactory.create<NestExpressApplication>(ApiModule, {
    logger: customLogger,
  })
  app.use(helmet())
  app.enableCors({ origin: false })
  app.set('trust proxy', 1)
  app.use(metricsMiddleware)
  app.get(METRICS_ALIAS_PATH, servePrometheusMetrics)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  )
  app.enableShutdownHooks()
  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/live', 'health/ready', 'metrics', 'prom-metrics'],
  })
  if (process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('CSA API')
      .setDescription('CSA BACKEND API')
      .build()
    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('/api/docs', app, document)
  }

  return app
}

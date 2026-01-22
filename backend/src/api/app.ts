import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { metricsMiddleware } from 'src/common/middleware/prom'
import { customLogger } from '../common/config/logger.config'
import { ApiModule } from './api.module'

/**
 *
 */
export async function bootstrap() {
  const app: NestExpressApplication = await NestFactory.create<NestExpressApplication>(ApiModule, {
    logger: customLogger,
  })
  app.use(helmet())
  app.enableCors()
  app.set('trust proxy', 1)
  app.use(metricsMiddleware)
  app.enableShutdownHooks()
  app.setGlobalPrefix('api')
  const config = new DocumentBuilder().setTitle('CSA API').setDescription('CSA BACKEND API').build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('/api/docs', app, document)
  return app
}

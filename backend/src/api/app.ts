import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ApiModule } from './api.module'
import { customLogger } from '../common/config/logger.config'
import type { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import { VersioningType } from '@nestjs/common'
import { metricsMiddleware } from 'src/common/middleware/prom'

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
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'v',
  })
  const config = new DocumentBuilder()
    .setTitle('Users example')
    .setDescription('The user API description')
    .setVersion('1.0')
    .addTag('users')
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('/api/docs', app, document)
  return app
}

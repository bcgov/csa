import type { NestExpressApplication } from '@nestjs/platform-express'
import { bootstrap } from './app'

vi.mock('prom-client', () => ({
  Registry: vi.fn().mockImplementation(() => ({})),
  collectDefaultMetrics: vi.fn().mockImplementation(() => ({})),
}))
vi.mock('express-prom-bundle', () => ({
  default: vi.fn().mockImplementation(() => ({})),
}))
vi.mock('src/common/middleware/prom', () => ({
  metricsMiddleware: vi.fn().mockImplementation((_req, _res, next) => next()),
}))
vi.mock('src/common/logger/logger.config', () => ({
  customLogger: false,
}))

describe('main', () => {
  let app: NestExpressApplication

  beforeAll(async () => {
    process.env.ICM_API_URL = 'http://test-icm'
    process.env.ICM_TRUSTED_USERNAME = 'test-user'
    process.env.ICM_TOKEN_URL = 'http://test-keycloak/token'
    process.env.ICM_CLIENT_ID = 'test-client'
    process.env.ICM_CLIENT_SECRET = 'test-secret'
    app = await bootstrap()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should start the application', async () => {
    expect(app).toBeDefined()
  })
})

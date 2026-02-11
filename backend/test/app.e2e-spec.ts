import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { ApiModule } from '../src/api/api.module'

describe('AppController (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    process.env.ICM_API_URL = 'http://test-icm'
    process.env.ICM_TRUSTED_USERNAME = 'test-user'
    process.env.ICM_TOKEN_URL = 'http://test-keycloak/token'
    process.env.ICM_CLIENT_ID = 'test-client'
    process.env.ICM_CLIENT_SECRET = 'test-secret'

    const moduleFixture = await Test.createTestingModule({
      imports: [ApiModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  it('/ (GET)', () => request(app.getHttpServer()).get('/').expect(200).expect('Hello Backend!'))
})

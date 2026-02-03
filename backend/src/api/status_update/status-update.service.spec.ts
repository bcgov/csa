import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from 'src/common/database/prisma.service'
import { StatusUpdateService } from './status-update.service'

describe('StatusUpdateService', () => {
  let service: StatusUpdateService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusUpdateService,
        {
          provide: PrismaService,
          useValue: {
            contact: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            batch: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile()

    service = module.get<StatusUpdateService>(StatusUpdateService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})

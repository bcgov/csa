import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from 'src/common/database/prisma.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
              findUnique: vi.fn(),
              update: vi.fn(),
            },
            batch: {
              findUnique: vi.fn(),
              update: vi.fn(),
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

import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StatusUpdateController } from './status-update.controller'
import { StatusUpdateService } from './status-update.service'

describe('StatusUpdateController', () => {
  let controller: StatusUpdateController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatusUpdateController],
      providers: [
        {
          provide: StatusUpdateService,
          useValue: {
            updateContactStatus: vi.fn(),
            updateBatchStatus: vi.fn(),
            getContactStatuses: vi.fn(),
            getBatchStatuses: vi.fn(),
          },
        },
      ],
    }).compile()

    controller = module.get<StatusUpdateController>(StatusUpdateController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})

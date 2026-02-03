import { Test, TestingModule } from '@nestjs/testing'
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
            updateContactStatus: jest.fn(),
            updateBatchStatus: jest.fn(),
            getContactStatuses: jest.fn(),
            getBatchStatuses: jest.fn(),
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

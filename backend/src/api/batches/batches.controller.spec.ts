import type { INestApplication } from '@nestjs/common'
import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { CSAGuard } from '../common/guards/csa.guard'
import { BATCH_STATUSES } from '../contacts/constants'
import { BatchesController } from './batches.controller'
import { BatchesService } from './batches.service'

// Mock guard that always allows access
const mockCSAGuard = {
  canActivate: () => true,
}

describe('BatchesController', () => {
  let app: INestApplication
  let controller: BatchesController

  const mockBatchesService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    findBatchContacts: vi.fn(),
    findOrCreatePendingBatch: vi.fn(),
    addContactsToPendingBatch: vi.fn(),
    removeContactFromPendingBatch: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BatchesController],
      providers: [{ provide: BatchesService, useValue: mockBatchesService }],
    })
      .overrideGuard(CSAGuard)
      .useValue(mockCSAGuard)
      .compile()

    app = module.createNestApplication()
    await app.init()

    controller = module.get<BatchesController>(BatchesController)
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await app.close()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('GET /batches', () => {
    it('should return all batches', async () => {
      const batches = [
        { id: 1, status: 'processed', batchDate: '2026-01-28' },
        { id: 2, status: 'pending', batchDate: null },
      ]
      mockBatchesService.findAll.mockResolvedValue(batches)

      return request(app.getHttpServer()).get('/batches').expect(200).expect(batches)
    })
  })

  describe('GET /batches/pending', () => {
    it('should return or create pending batch', async () => {
      const pendingBatch = { id: 1, status: BATCH_STATUSES.PENDING, recordCount: 0 }
      mockBatchesService.findOrCreatePendingBatch.mockResolvedValue(pendingBatch)

      return request(app.getHttpServer()).get('/batches/pending').expect(200).expect(pendingBatch)
    })
  })

  describe('POST /batches/pending/contacts', () => {
    it('should add contacts to pending batch', async () => {
      const result = {
        batch: { id: 1, status: BATCH_STATUSES.PENDING, recordCount: 2 },
        success: [1, 2],
        skipped: [{ id: 999, reason: 'not_found' }],
      }
      mockBatchesService.addContactsToPendingBatch.mockResolvedValue(result)

      return request(app.getHttpServer())
        .post('/batches/pending/contacts')
        .send({ contactIds: [1, 2, 999] })
        .expect(201)
        .expect(result)
    })
  })

  describe('DELETE /batches/pending/contacts/:contactId', () => {
    it('should remove contact from pending batch', async () => {
      mockBatchesService.removeContactFromPendingBatch.mockResolvedValue(undefined)

      return request(app.getHttpServer()).delete('/batches/pending/contacts/100').expect(204)
    })
  })

  describe('GET /batches/:id', () => {
    it('should return batch by id', async () => {
      const batch = { id: 1, status: 'processed', batchDate: '2026-01-28' }
      mockBatchesService.findOne.mockResolvedValue(batch)

      return request(app.getHttpServer()).get('/batches/1').expect(200).expect(batch)
    })
  })

  describe('GET /batches/:id/contacts', () => {
    it('should return contacts in batch', async () => {
      const details = [
        {
          id: 1,
          contactId: 100,
          batchId: 1,
          contact: { id: 100, lastName: 'Doe', firstName: 'John' },
        },
      ]
      mockBatchesService.findBatchContacts.mockResolvedValue(details)

      return request(app.getHttpServer()).get('/batches/1/contacts').expect(200).expect(details)
    })
  })
})

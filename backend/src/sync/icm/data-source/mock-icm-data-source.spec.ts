import { Test, TestingModule } from '@nestjs/testing'
import { MockIcmDataSource } from './mock-icm-data-source'
import { IcmApiConfig } from '../icm.config'
import * as fs from 'fs'

vi.mock('fs')

const testConfig: IcmApiConfig = {
  name: 'cases',
  endpoint: '/data/Case',
  stagingTable: 'stg_icm_cases',
  primaryKey: 'row_id',
  cursorLabel: 'Last Updated Date',
  fieldMap: [],
}

describe('MockIcmDataSource', () => {
  let service: MockIcmDataSource

  beforeEach(async () => {
    vi.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [MockIcmDataSource],
    }).compile()

    service = module.get<MockIcmDataSource>(MockIcmDataSource)
  })

  describe('fetchAll', () => {
    it('should read mock .json file and return items', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ items: [{ 'Row Id': '1' }, { 'Row Id': '2' }] }),
      )

      const results = await service.fetchAll(testConfig)

      expect(results).toHaveLength(2)
      expect(results[0]['Row Id']).toBe('1')
    })

    it('should return empty array when mock file not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const results = await service.fetchAll(testConfig)

      expect(results).toHaveLength(0)
    })

    it('should filter records by lastUpdated using cursorLabel', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          items: [
            { 'Row Id': '1', 'Last Updated Date': '01/10/2026 10:00:00' },
            { 'Row Id': '2', 'Last Updated Date': '01/15/2026 10:00:00' },
            { 'Row Id': '3', 'Last Updated Date': '01/20/2026 10:00:00' },
          ],
        }),
      )

      const lastUpdated = new Date(2026, 0, 15, 10, 0, 0) // Jan 15
      const results = await service.fetchAll(testConfig, lastUpdated)

      expect(results).toHaveLength(1)
      expect(results[0]['Row Id']).toBe('3')
    })

    it('should return all records when lastUpdated is not provided', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          items: [
            { 'Row Id': '1', 'Last Updated Date': '01/01/2020 00:00:00' },
            { 'Row Id': '2', 'Last Updated Date': '01/01/2020 00:00:00' },
          ],
        }),
      )

      const results = await service.fetchAll(testConfig)

      expect(results).toHaveLength(2)
    })

    it('should load flat ooc agreement line mock records', async () => {
      const oocConfig: IcmApiConfig = {
        name: 'ooc_agreement_lines',
        endpoint: '/AgreementLines/AgreementLine',
        stagingTable: 'stg_icm_agreement_line',
        primaryKey: 'ROW_ID',
        cursorLabel: 'Updated',
        fieldMap: [],
      }

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          items: [
            {
              Id: 'mock-line-001',
              Updated: '05/26/2026 10:00:00',
              'Agreement Id': 'mock-agreement-001',
              'ICM Person ID': 'mock-person-001',
            },
            {
              Id: 'mock-line-002',
              Updated: '05/26/2026 10:00:00',
              'Agreement Id': 'mock-agreement-001',
              'ICM Person ID': 'mock-person-001',
            },
          ],
        }),
      )

      const results = await service.fetchAll(oocConfig)

      expect(results).toHaveLength(2)
      expect(results[0]).toMatchObject({
        Id: 'mock-line-001',
        'Agreement Id': 'mock-agreement-001',
        'ICM Person ID': 'mock-person-001',
      })
    })

    it('should include records with missing or unparseable cursor field', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          items: [{ 'Row Id': '1' }, { 'Row Id': '2', 'Last Updated Date': 'invalid' }],
        }),
      )

      const results = await service.fetchAll(testConfig, new Date())

      expect(results).toHaveLength(2)
    })
  })
})

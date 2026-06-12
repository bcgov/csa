import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { of } from 'rxjs'
import { KeycloakAuthService } from 'src/common/auth/keycloak-auth.service'
import { IcmApiConfig } from '../icm.config'
import * as icmConfig from '../icm.config'
import { OOC_AGREEMENT_LINES_FIELDS, OOC_AGREEMENT_LINES_SEARCH_SPEC } from '../agreement-lines'
import { IcmApiDataSource } from './icm-api-data-source'
import { IcmContactUpdatePayload } from './icm-data-source'

const mockConfig: IcmApiConfig = {
  name: 'cases',
  endpoint: '/data/Case',
  stagingTable: 'stg_icm_cases',
  primaryKey: 'ROW_ID',
  cursorLabel: 'Key Player Last Updated Date',
  fieldMap: [],
}

describe('IcmApiDataSource', () => {
  let service: IcmApiDataSource
  let httpService: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> }
  let configService: { get: ReturnType<typeof vi.fn> }
  let keycloakAuthService: { getBearerToken: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    vi.spyOn(icmConfig, 'isOocAgreementLinesConfig').mockReturnValue(false)

    httpService = { get: vi.fn(), put: vi.fn() }

    keycloakAuthService = {
      getBearerToken: vi.fn().mockResolvedValue('test-token'),
    }

    configService = {
      get: vi.fn((key: string) => {
        const values: Record<string, unknown> = {
          'admin.icmApiUrl': 'http://icm-api',
          'admin.icmTrustedUsername': 'trusted-user',
          'icm.workspace': '',
          'sync.icmRequestTimeoutMs': 30_000,
        }
        return values[key]
      }),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IcmApiDataSource,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
        { provide: KeycloakAuthService, useValue: keycloakAuthService },
      ],
    }).compile()

    service = module.get<IcmApiDataSource>(IcmApiDataSource)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetchAll', () => {
    it('should return empty for ooc agreement lines ingest', async () => {
      vi.spyOn(icmConfig, 'isOocAgreementLinesConfig').mockReturnValue(true)

      const oocConfig: IcmApiConfig = {
        ...mockConfig,
        name: 'ooc_agreement_lines',
      }

      const results = await service.fetchAll(oocConfig)

      expect(results).toEqual([])
      expect(httpService.get).not.toHaveBeenCalled()
    })

    it('should paginate until fewer items than page size', async () => {
      httpService.get
        .mockReturnValueOnce(
          of({
            status: 200,
            headers: {},
            data: {
              items: Array.from({ length: 100 }, (_, i) => ({ Id: `${i}` })),
            },
          }),
        )
        .mockReturnValueOnce(
          of({
            status: 200,
            headers: {},
            data: {
              items: [{ Id: '100' }, { Id: '251' }],
            },
          }),
        )

      const results = await service.fetchAll(mockConfig)

      expect(results).toHaveLength(102)
      expect(httpService.get).toHaveBeenCalledTimes(2)
    })

    it('should stop pagination on 404', async () => {
      httpService.get
        .mockReturnValueOnce(
          of({
            status: 200,
            headers: {},
            data: { items: [{ Id: '1' }] },
          }),
        )
        .mockReturnValueOnce(of({ status: 404, headers: {}, data: null }))

      // items.length (1) < PAGE_SIZE (250), so it stops after first page
      const results = await service.fetchAll(mockConfig)
      expect(results).toHaveLength(1)
    })

    it('should handle single object response (ICM returns unwrapped item)', async () => {
      httpService.get.mockReturnValueOnce(
        of({
          status: 200,
          headers: {},
          data: { items: { Id: 'single-record' } },
        }),
      )

      const results = await service.fetchAll(mockConfig)

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual({ Id: 'single-record' })
    })

    it('should include common query params in URL', async () => {
      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      await service.fetchAll(mockConfig)

      const callUrl = httpService.get.mock.calls[0][0]
      expect(callUrl).toContain('ViewMode=Catalog')
      expect(callUrl).toContain('excludeEmptyFieldsInResponse=False')
      expect(callUrl).toContain('GetChildren=false')
      expect(callUrl).toContain('childlinks=None')
      expect(callUrl).toContain('ExecutionMode=ForwardOnly')
    })

    it('should send fields param for agreement lines endpoint', async () => {
      const oocConfig: IcmApiConfig = {
        ...mockConfig,
        name: 'ooc_agreement_lines',
        endpoint: '/AgreementLines/AgreementLine',
        searchSpec: () => OOC_AGREEMENT_LINES_SEARCH_SPEC,
        fields: OOC_AGREEMENT_LINES_FIELDS,
      }

      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      await service.fetchAll(oocConfig)

      const callUrl = decodeURIComponent(httpService.get.mock.calls[0][0]).replace(/\+/g, ' ')
      expect(callUrl).toContain('/AgreementLines/AgreementLine')
      expect(callUrl).toContain('ViewMode=Catalog')
      expect(callUrl).toContain('GetChildren=false')
      expect(callUrl).toContain('fields=Id,Updated,ICM Person ID,Agreement Id')
      expect(callUrl).toContain("[Agreement Type] = 'Out of Care'")
    })

    it('should return flat agreement line items from paginated response', async () => {
      const oocConfig: IcmApiConfig = {
        ...mockConfig,
        name: 'ooc_agreement_lines',
        endpoint: '/AgreementLines/AgreementLine',
        searchSpec: () => OOC_AGREEMENT_LINES_SEARCH_SPEC,
        fields: OOC_AGREEMENT_LINES_FIELDS,
      }

      httpService.get.mockReturnValue(
        of({
          status: 200,
          headers: {},
          data: {
            items: [
              {
                Id: 'mock-line-001',
                'Agreement Id': 'mock-agreement-001',
                'ICM Person ID': 'mock-person-001',
                Updated: '05/26/2026 10:00:00',
              },
              {
                Id: 'mock-line-002',
                'Agreement Id': 'mock-agreement-001',
                'ICM Person ID': 'mock-person-001',
                Updated: '05/26/2026 10:00:00',
              },
            ],
          },
        }),
      )

      const results = await service.fetchAll(oocConfig)

      expect(results).toHaveLength(2)
      expect(results[1]).toMatchObject({
        Id: 'mock-line-002',
        'Agreement Id': 'mock-agreement-001',
        'ICM Person ID': 'mock-person-001',
        Updated: '05/26/2026 10:00:00',
      })
    })

    it('should include workspace param when configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'icm.workspace') return 'int_release_5.4'
        if (key === 'admin.icmApiUrl') return 'http://icm-api'
        if (key === 'admin.icmTrustedUsername') return 'trusted-user'
        return undefined
      })

      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      await service.fetchAll(mockConfig)

      const callUrl = httpService.get.mock.calls[0][0]
      expect(callUrl).toContain('workspace=int_release_5.4')
    })

    it('should include SearchSpec with cursor when lastUpdated is provided', async () => {
      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      // Jan 15 20:00 UTC = Jan 15 12:00 PST
      const lastUpdated = new Date('2026-01-15T20:00:00Z')
      await service.fetchAll(mockConfig, lastUpdated)

      const callUrl = httpService.get.mock.calls[0][0]
      const decoded = decodeURIComponent(callUrl).replace(/\+/g, ' ')
      expect(decoded).toContain('SearchSpec=')
      expect(decoded).toContain('[Key Player Last Updated Date] > "01/15/2026"')
    })

    it('should build OR cursor filter when cursorLabel is an array', async () => {
      const multiCursorConfig: IcmApiConfig = {
        ...mockConfig,
        cursorLabel: ['Key Player Last Updated Date', 'Last Updated Date'],
      }

      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      const lastUpdated = new Date('2026-01-15T20:00:00Z')
      await service.fetchAll(multiCursorConfig, lastUpdated)

      const callUrl = httpService.get.mock.calls[0][0]
      const decoded = decodeURIComponent(callUrl).replace(/\+/g, ' ')
      expect(decoded).toContain(
        '([Key Player Last Updated Date] > "01/15/2026" OR [Last Updated Date] > "01/15/2026")',
      )
    })

    it('should combine static searchSpec with multi-cursor using AND', async () => {
      const multiCursorConfig: IcmApiConfig = {
        ...mockConfig,
        cursorLabel: ['Key Player Last Updated Date', 'Last Updated Date'],
        searchSpec: () => '[Type] = "Child Services"',
      }

      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      const lastUpdated = new Date('2026-01-10T20:00:00Z')
      await service.fetchAll(multiCursorConfig, lastUpdated)

      const callUrl = httpService.get.mock.calls[0][0]
      const decoded = decodeURIComponent(callUrl).replace(/\+/g, ' ')
      expect(decoded).toContain(
        '([Type] = "Child Services") AND ([Key Player Last Updated Date] > "01/10/2026" OR [Last Updated Date] > "01/10/2026")',
      )
    })

    it('should combine static searchSpec with cursor using AND', async () => {
      const configWithSpec: IcmApiConfig = {
        ...mockConfig,
        searchSpec: () => '([Agreement Type] = "SHSS")',
      }

      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      const lastUpdated = new Date('2026-01-10T20:00:00Z')
      await service.fetchAll(configWithSpec, lastUpdated)

      const callUrl = httpService.get.mock.calls[0][0]
      const decoded = decodeURIComponent(callUrl).replace(/\+/g, ' ')
      expect(decoded).toContain(
        '(([Agreement Type] = "SHSS")) AND [Key Player Last Updated Date] > "01/10/2026"',
      )
    })

    it('should not include SearchSpec when no filter and no lastUpdated', async () => {
      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      await service.fetchAll(mockConfig)

      const callUrl = httpService.get.mock.calls[0][0]
      expect(callUrl).not.toContain('SearchSpec=')
    })

    it('should use date-only format for cursor (no time)', async () => {
      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      // Jan 15 22:30:45 UTC = Jan 15 14:30:45 PST
      const lastUpdated = new Date('2026-01-15T22:30:45Z')
      await service.fetchAll(mockConfig, lastUpdated)

      const callUrl = httpService.get.mock.calls[0][0]
      const decoded = decodeURIComponent(callUrl).replace(/\+/g, ' ')
      expect(decoded).toContain('01/15/2026')
      expect(decoded).not.toContain('14:30:45')
    })

    it('should use timeout from config', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'sync.icmRequestTimeoutMs') return 60_000
        if (key === 'admin.icmApiUrl') return 'http://icm-api'
        if (key === 'admin.icmTrustedUsername') return 'trusted-user'
        return undefined
      })
      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      await service.fetchAll(mockConfig)

      const requestConfig = httpService.get.mock.calls[0][1]
      expect(requestConfig.timeout).toBe(60_000)
    })

    it('should use KeycloakAuthService for bearer token', async () => {
      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      await service.fetchAll(mockConfig)

      expect(keycloakAuthService.getBearerToken).toHaveBeenCalledTimes(1)
    })
  })

  describe('updateContacts', () => {
    const payload: IcmContactUpdatePayload = {
      Id: 'ICM-001',
      'CSA Status': 'eligible',
      'CSA Status Effective Date': '01/15/2026',
      'CSA DIN': '12345',
    }

    it('should send PUT to /ICMContact/ICMContact with query params and auth headers', async () => {
      httpService.put.mockReturnValue(of({ status: 200, data: {} }))

      await service.updateContacts([payload])

      const callUrl = httpService.put.mock.calls[0][0]
      expect(callUrl).toContain('http://icm-api/ICMContact/ICMContact?')
      expect(callUrl).toContain('ViewMode=Catalog')
      expect(callUrl).toContain('ExecutionMode=ForwardOnly')

      expect(httpService.put).toHaveBeenCalledWith(
        callUrl,
        [payload],
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token',
            'X-ICM-TrustedUsername': 'trusted-user',
            'Content-Type': 'application/json',
          },
        }),
      )
    })

    it('should include workspace param when configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'icm.workspace') return 'int_release_5.4'
        if (key === 'admin.icmApiUrl') return 'http://icm-api'
        if (key === 'admin.icmTrustedUsername') return 'trusted-user'
        return undefined
      })

      httpService.put.mockReturnValue(of({ status: 200, data: {} }))

      await service.updateContacts([payload])

      const callUrl = httpService.put.mock.calls[0][0]
      expect(callUrl).toContain('workspace=int_release_5.4')
    })

    it('should use timeout from config', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'sync.icmRequestTimeoutMs') return 60_000
        if (key === 'admin.icmApiUrl') return 'http://icm-api'
        if (key === 'admin.icmTrustedUsername') return 'trusted-user'
        return undefined
      })
      httpService.put.mockReturnValue(of({ status: 200, data: {} }))

      await service.updateContacts([payload])

      const requestConfig = httpService.put.mock.calls[0][2]
      expect(requestConfig.timeout).toBe(60_000)
    })

    it('should throw on non-2xx response', async () => {
      httpService.put.mockReturnValue(of({ status: 500, data: { error: 'Server Error' } }))

      await expect(service.updateContacts([payload])).rejects.toThrow(
        'ICM PUT /ICMContact/ICMContact failed: status=500',
      )
    })

    it('should be a no-op for empty array', async () => {
      await service.updateContacts([])

      expect(httpService.put).not.toHaveBeenCalled()
    })

    it('should throw when batch exceeds 100 contacts', async () => {
      const largePayload = Array.from({ length: 101 }, (_, i) => ({
        ...payload,
        Id: `ICM-${i}`,
      }))

      await expect(service.updateContacts(largePayload)).rejects.toThrow(
        'ICM batch limit is 100 contacts, got 101',
      )
    })
  })
})

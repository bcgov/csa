import { Test, TestingModule } from '@nestjs/testing'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { of } from 'rxjs'
import { KeycloakAuthService } from 'src/common/auth/keycloak-auth.service'
import { IcmApiDataSource } from './icm-api-data-source'
import { IcmApiConfig } from '../icm.config'

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
  let httpService: { get: ReturnType<typeof vi.fn> }
  let configService: { get: ReturnType<typeof vi.fn> }
  let keycloakAuthService: { getBearerToken: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    httpService = { get: vi.fn() }

    keycloakAuthService = {
      getBearerToken: vi.fn().mockResolvedValue('test-token'),
    }

    configService = {
      get: vi.fn((key: string) => {
        const values: Record<string, unknown> = {
          'admin.icmApiUrl': 'http://icm-api',
          'admin.icmTrustedUsername': 'trusted-user',
          'icm.workspace': '',
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

  describe('fetchAll', () => {
    it('should paginate until fewer items than page size', async () => {
      httpService.get
        .mockReturnValueOnce(
          of({
            status: 200,
            headers: {},
            data: {
              items: Array.from({ length: 250 }, (_, i) => ({ Id: `${i}` })),
            },
          }),
        )
        .mockReturnValueOnce(
          of({
            status: 200,
            headers: {},
            data: {
              items: [{ Id: '250' }, { Id: '251' }],
            },
          }),
        )

      const results = await service.fetchAll(mockConfig)

      expect(results).toHaveLength(252)
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

    it('should include common query params in URL', async () => {
      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      await service.fetchAll(mockConfig)

      const callUrl = httpService.get.mock.calls[0][0]
      expect(callUrl).toContain('ViewMode=Catalog')
      expect(callUrl).toContain('excludeEmptyFieldsInResponse=False')
      expect(callUrl).toContain('GetChildren=false')
      expect(callUrl).toContain('childlinks=None')
      expect(callUrl).toContain('recordcountneeded=true')
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

      const lastUpdated = new Date(2026, 0, 15) // Jan 15, 2026
      await service.fetchAll(mockConfig, lastUpdated)

      const callUrl = httpService.get.mock.calls[0][0]
      const decoded = decodeURIComponent(callUrl).replace(/\+/g, ' ')
      expect(decoded).toContain('SearchSpec=')
      expect(decoded).toContain('[Key Player Last Updated Date] > "01/15/2026"')
    })

    it('should combine static searchSpec with cursor using AND', async () => {
      const configWithSpec: IcmApiConfig = {
        ...mockConfig,
        searchSpec: () => '([Agreement Type] = "SHSS")',
      }

      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      const lastUpdated = new Date(2026, 0, 10)
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

      const lastUpdated = new Date(2026, 0, 15, 14, 30, 45)
      await service.fetchAll(mockConfig, lastUpdated)

      const callUrl = httpService.get.mock.calls[0][0]
      const decoded = decodeURIComponent(callUrl).replace(/\+/g, ' ')
      expect(decoded).toContain('01/15/2026')
      expect(decoded).not.toContain('14:30:45')
    })

    it('should use KeycloakAuthService for bearer token', async () => {
      httpService.get.mockReturnValue(of({ status: 200, headers: {}, data: { items: [] } }))

      await service.fetchAll(mockConfig)

      expect(keycloakAuthService.getBearerToken).toHaveBeenCalledTimes(1)
    })
  })
})

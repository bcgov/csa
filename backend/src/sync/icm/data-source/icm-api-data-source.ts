import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import { KeycloakAuthService } from 'src/common/auth/keycloak-auth.service'
import { formatDatePacific } from 'src/common/utils'
import { ICM_UPDATE_BATCH_LIMIT, IcmApiConfig } from '../icm.config'
import { IcmApiRecord, IcmContactUpdatePayload, IcmDataSource } from './icm-data-source'

const PAGE_SIZE = 100

@Injectable()
export class IcmApiDataSource extends IcmDataSource {
  private readonly logger = new Logger(IcmApiDataSource.name)

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly keycloakAuthService: KeycloakAuthService,
  ) {
    super()
  }

  async fetchAll(config: IcmApiConfig, lastUpdated?: Date): Promise<IcmApiRecord[]> {
    const icmApiUrl = this.configService.get<string>('admin.icmApiUrl')!
    const icmTrustedUsername = this.configService.get<string>('admin.icmTrustedUsername')!
    const timeout = this.configService.get<number>('sync.icmRequestTimeoutMs')!

    const allRecords: IcmApiRecord[] = []
    let startRow = 0

    const baseUrl = this.buildUrl(icmApiUrl, config, lastUpdated)

    let hasMore = true
    while (hasMore) {
      const bearerToken = await this.keycloakAuthService.getBearerToken()
      const pageUrl = `${baseUrl}&PageSize=${PAGE_SIZE}&StartRowNum=${startRow}`

      this.logger.log(`Fetching ${config.name}: startRow=${startRow}`)
      this.logger.log(`Request URL: ${pageUrl}`)

      const response = await firstValueFrom(
        this.httpService.get(pageUrl, {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'X-ICM-TrustedUsername': icmTrustedUsername,
            'Content-Type': 'application/json',
          },
          timeout,
          validateStatus: () => true,
        }),
      )

      if (response.status === 404) {
        this.logger.log(`Fetching ${config.name}: received 404, no more records`)
        break
      }

      if (response.status !== 200) {
        throw new Error(
          `ICM API error for ${config.name}: status=${response.status}, body=${JSON.stringify(response.data)}`,
        )
      }

      const raw = response.data?.items
      const items: IcmApiRecord[] = Array.isArray(raw) ? raw : raw ? [raw] : []
      if (items.length === 0) break

      allRecords.push(...items)
      startRow += items.length
      hasMore = items.length === PAGE_SIZE
    }

    this.logger.log(`Fetched ${allRecords.length} ${config.name} records total`)
    return allRecords
  }

  async updateContacts(contacts: IcmContactUpdatePayload[]): Promise<void> {
    if (contacts.length === 0) return
    if (contacts.length > ICM_UPDATE_BATCH_LIMIT) {
      throw new Error(
        `ICM batch limit is ${ICM_UPDATE_BATCH_LIMIT} contacts, got ${contacts.length}`,
      )
    }

    const bearerToken = await this.keycloakAuthService.getBearerToken()
    const icmApiUrl = this.configService.get<string>('admin.icmApiUrl')!
    const icmTrustedUsername = this.configService.get<string>('admin.icmTrustedUsername')!
    const timeout = this.configService.get<number>('sync.icmRequestTimeoutMs')!

    const params = new URLSearchParams({
      ViewMode: 'Catalog',
      ExecutionMode: 'ForwardOnly',
    })

    const workspace = this.configService.get<string>('icm.workspace')
    if (workspace) {
      params.set('workspace', workspace)
    }

    const url = `${icmApiUrl}/ICMContact/ICMContact?${params.toString()}`

    const response = await firstValueFrom(
      this.httpService.put(url, contacts, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'X-ICM-TrustedUsername': icmTrustedUsername,
          'Content-Type': 'application/json',
        },
        timeout,
        validateStatus: () => true,
      }),
    )

    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `ICM PUT /ICMContact/ICMContact failed: status=${response.status}, body=${JSON.stringify(response.data)}`,
      )
    }

    this.logger.log(`Synced ${contacts.length} contacts to ICM`)
  }

  private buildUrl(baseUrl: string, config: IcmApiConfig, lastUpdated?: Date): string {
    const params = new URLSearchParams({
      ViewMode: 'Catalog',
      excludeEmptyFieldsInResponse: 'False',
      ExecutionMode: 'ForwardOnly',
      GetChildren: 'false',
      childlinks: 'None',
    })

    if (config.fields) {
      params.set('fields', config.fields)
    }

    const workspace = this.configService.get<string>('icm.workspace')
    if (workspace) {
      params.set('workspace', workspace)
    }

    // Combine static searchSpec + incremental cursor
    const specParts: string[] = []

    if (config.searchSpec) {
      specParts.push(config.searchSpec())
    }

    if (lastUpdated) {
      const dateStr = formatDatePacific(lastUpdated)
      const labels = Array.isArray(config.cursorLabel) ? config.cursorLabel : [config.cursorLabel]
      const cursorFilter =
        labels.length === 1
          ? `[${labels[0]}] > "${dateStr}"`
          : `(${labels.map((l) => `[${l}] > "${dateStr}"`).join(' OR ')})`
      specParts.push(cursorFilter)
    }

    if (specParts.length > 0) {
      const searchSpec =
        specParts.length === 1 ? specParts[0] : `(${specParts[0]}) AND ${specParts[1]}`
      params.set('SearchSpec', searchSpec)
    }

    return `${baseUrl}${config.endpoint}?${params.toString()}`
  }
}

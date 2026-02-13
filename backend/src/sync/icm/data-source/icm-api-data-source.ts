import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import { KeycloakAuthService } from 'src/common/auth/keycloak-auth.service'
import { formatDate } from 'src/common/utils'
import { IcmApiConfig } from '../icm.config'
import { IcmApiRecord, IcmDataSource } from './icm-data-source'

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
    const bearerToken = await this.keycloakAuthService.getBearerToken()
    const icmApiUrl = this.configService.get<string>('admin.icmApiUrl')!
    const icmTrustedUsername = this.configService.get<string>('admin.icmTrustedUsername')!

    const allRecords: IcmApiRecord[] = []
    let startRow = 0

    const baseUrl = this.buildUrl(icmApiUrl, config, lastUpdated)

    let hasMore = true
    while (hasMore) {
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
          validateStatus: (status) => status === 200 || status === 404 || status === 500,
        }),
      )

      if (response.status === 404) {
        this.logger.log(`Fetching ${config.name}: received 404, no more records`)
        break
      }

      if (response.status === 500) {
        this.logger.log(`Response status: ${response.status}`)
        this.logger.log(`Response headers: ${JSON.stringify(response.headers)}`)
        this.logger.error(
          `ICM API error for ${config.name}: status=${response.status}, body=${JSON.stringify(response.data)}`,
        )
        throw new Error(`ICM API returned ${response.status} for ${config.name}`)
      }

      const items: IcmApiRecord[] = response.data?.items ?? []
      if (items.length === 0) break

      allRecords.push(...items)
      startRow += items.length
      hasMore = items.length === PAGE_SIZE
    }

    this.logger.log(`Fetched ${allRecords.length} ${config.name} records total`)
    return allRecords
  }

  private buildUrl(baseUrl: string, config: IcmApiConfig, lastUpdated?: Date): string {
    const params = new URLSearchParams({
      ViewMode: 'Catalog',
      excludeEmptyFieldsInResponse: 'False',
      recordcountneeded: 'true',
      GetChildren: 'false',
      childlinks: 'None',
    })

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
      specParts.push(`[${config.cursorLabel}] > "${formatDate(lastUpdated)}"`)
    }

    if (specParts.length > 0) {
      const searchSpec =
        specParts.length === 1 ? specParts[0] : `(${specParts[0]}) AND ${specParts[1]}`
      params.set('SearchSpec', searchSpec)
    }

    return `${baseUrl}${config.endpoint}?${params.toString()}`
  }
}

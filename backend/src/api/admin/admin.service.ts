import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import { KeycloakAuthService } from 'src/common/auth/keycloak-auth.service'
import { normalize } from 'src/common/utils'
import { ICMEmployeeResponse } from './interfaces/icm-api.interface'

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly keycloakAuthService: KeycloakAuthService,
  ) {}

  async verifyCSAAccess(username: string): Promise<{
    hasAccess: boolean
    message: string
    userProfile?: string
    icmResponsibility?: string
  }> {
    try {
      const icmData = await this.fetchUserFromICM(username)

      let hasCSAResponsibility = false
      let icmResponsibilityName: string | undefined
      let userProfile: string | undefined

      if (icmData?.items?.Responsibility) {
        const responsibilities = Array.isArray(icmData.items.Responsibility)
          ? icmData.items.Responsibility
          : [icmData.items.Responsibility]
        const rwResponsibility = responsibilities.find(
          (r) => normalize(r.Name) === 'ICM CSA APPLICATION - RW',
        )
        const roResponsibility = responsibilities.find(
          (r) => normalize(r.Name) === 'ICM CSA APPLICATION - RO',
        )
        const dataStewardResponsibility = responsibilities.find(
          (r) => normalize(r.Name) === 'ICM DATA STEWARD',
        )

        const hasRwResponsibility = !!rwResponsibility
        const hasRoResponsibility = !!roResponsibility
        const hasDataStewardResponsibility = !!dataStewardResponsibility

        hasCSAResponsibility = hasRwResponsibility || hasRoResponsibility
        if (hasCSAResponsibility) {
          userProfile =
            hasRwResponsibility && hasDataStewardResponsibility
              ? 'DATA_QUALITY_STEWARD'
              : 'CSA_STANDARD'
          icmResponsibilityName = rwResponsibility?.Name || roResponsibility?.Name
        }
      }

      if (hasCSAResponsibility) {
        return {
          hasAccess: true,
          message: 'User has CSA access',
          userProfile,
          icmResponsibility: icmResponsibilityName,
        }
      }

      return {
        hasAccess: false,
        message: 'User does not have ICM CSA Application responsibility',
      }
    } catch (error) {
      this.logger.error('Failed to verify CSA access from ICM:', error)
      return {
        hasAccess: false,
        message: 'Failed to verify user access from ICM system',
      }
    }
  }

  private async fetchUserFromICM(username: string): Promise<ICMEmployeeResponse> {
    try {
      this.logger.log('Fetching ICM bearer token...')
      const bearerToken = await this.keycloakAuthService.getBearerToken()

      const icmApiUrl = this.configService.get<string>('admin.icmApiUrl')!
      const icmTrustedUsername = this.configService.get<string>('admin.icmTrustedUsername')!
      const deployEnv = this.configService.get<string>('app.deployEnv')
      const configUsername = this.configService.get<string>('admin.icmUsername')

      let icmApiUsername = username
      if (configUsername && deployEnv !== 'prod') {
        this.logger.warn(
          `ICM username override active: using '${configUsername}' instead of '${username}'`,
        )
        icmApiUsername = configUsername
      } else if (configUsername && deployEnv === 'prod') {
        this.logger.warn('ICM_API_USERNAME is set but ignored in prod — using actual username')
      }

      const trustedUser = deployEnv === 'prod' ? icmApiUsername : icmTrustedUsername

      this.logger.log('Requesting ICM API with username:', icmApiUsername)

      const queryHierarchy = {
        Employee: {
          fields: 'Login Name, Party Name',
          searchspec: `[Login Name] = '${icmApiUsername.replace(/'/g, "''")}'`,
          Responsibility: {
            fields: 'Name',
            searchspec:
              "[Name] = 'ICM CSA Application - RW' OR [Name] = 'ICM CSA Application - RO' OR [Name] ='ICM Data Steward'",
          },
        },
      }

      const params = new URLSearchParams({
        ViewMode: 'Catalog',
        excludeEmptyFieldsInResponse: 'True',
        PageSize: '100',
        recordcountneeded: 'true',
        StartRowNum: '0',
        GetChildren: 'false',
        childlinks: 'None',
        QueryHierarchy: JSON.stringify(queryHierarchy),
      })

      const workspace = this.configService.get<string>('icm.workspace')
      if (workspace) {
        params.set('workspace', workspace)
      }

      const response = await firstValueFrom(
        this.httpService.get(`${icmApiUrl}/Employee/Employee?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'X-ICM-TrustedUsername': trustedUser,
          },
        }),
      )
      this.logger.log('ICM API response received:', response.data)

      return response.data
    } catch (error) {
      this.logger.error('ICM API request failed:', error)
      throw new HttpException(
        'Failed to fetch user data from ICM',
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }
}

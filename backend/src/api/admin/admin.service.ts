import { HttpService } from '@nestjs/axios'
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import { KeycloakAuthService } from 'src/common/auth/keycloak-auth.service'
import { normalize } from 'src/common/utils'
import { PermissionDto, UserPermissionsDto } from './dto/user-permissions.dto'
import { ICMEmployeeResponse } from './interfaces/icm-api.interface'

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly keycloakAuthService: KeycloakAuthService,
  ) {}

  async getUserPermissions(username: string): Promise<UserPermissionsDto> {
    try {
      const icmData = await this.fetchUserFromICM(username)
      const permissions = this.extractPermissionsFromICMData(icmData)
      const responsibilities = this.extractResponsibilitiesFromICMData(icmData)

      return {
        username,
        permissions,
        responsibilities,
        retrievedAt: new Date().toISOString(),
      }
    } catch (error) {
      this.logger.error('Failed to fetch user permissions from ICM', error)
      throw error
    }
  }

  async verifyCSAAccess(username: string): Promise<{
    hasAccess: boolean
    message: string
    icmResponsibility?: string
  }> {
    try {
      const icmData = await this.fetchUserFromICM(username)

      let hasCSAResponsibility = false
      let icmResponsibilityName: string | undefined

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

        if (rwResponsibility || roResponsibility) {
          hasCSAResponsibility = true
          icmResponsibilityName = rwResponsibility?.Name || roResponsibility?.Name
        }
      }

      if (hasCSAResponsibility) {
        return {
          hasAccess: true,
          message: 'User has CSA access',
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

  async hasPermission(username: string, permissionId: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(username)
    return userPermissions.permissions.some((p) => p.id === permissionId)
  }

  async hasResponsibility(username: string, responsibility: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(username)
    return userPermissions.responsibilities.includes(responsibility)
  }

  async fetchUserFromICM(username: string): Promise<ICMEmployeeResponse> {
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
              "[Name] = 'ICM CSA Application - RW' OR [Name] = 'ICM CSA Application - RO'",
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

  private extractPermissionsFromICMData(icmData: ICMEmployeeResponse): PermissionDto[] {
    const basePermissions: PermissionDto[] = [
      {
        id: 'applicants.read',
        name: 'Read Applicants',
        description: 'View applicant information',
        resource: 'applicants',
        action: 'read',
      },
      {
        id: 'batches.read',
        name: 'Read Batches',
        description: 'View batch information',
        resource: 'batches',
        action: 'read',
      },
    ]

    if (icmData?.items?.Responsibility) {
      const responsibilities = Array.isArray(icmData.items.Responsibility)
        ? icmData.items.Responsibility
        : [icmData.items.Responsibility]
      const hasRWAccess = responsibilities.some(
        (r) => normalize(r.Name) === 'ICM CSA APPLICATION - RW',
      )
      const hasROAccess = responsibilities.some(
        (r) => normalize(r.Name) === 'ICM CSA APPLICATION - RO',
      )

      if (hasRWAccess) {
        basePermissions.push(
          {
            id: 'applicants.write',
            name: 'Write Applicants',
            description: 'Create and update applicant information',
            resource: 'applicants',
            action: 'write',
          },
          {
            id: 'batches.write',
            name: 'Write Batches',
            description: 'Create and update batches',
            resource: 'batches',
            action: 'write',
          },
          {
            id: 'admin.access',
            name: 'CSA Admin Access',
            description: 'Access to CSA administrative functions',
            resource: 'admin',
            action: 'all',
          },
        )
      } else if (hasROAccess) {
        // TODO: ask if RO-specific permissions are needed
      }
    }

    return basePermissions
  }

  private extractResponsibilitiesFromICMData(icmData: ICMEmployeeResponse): string[] {
    const responsibilities = ['user']

    if (icmData?.items?.Responsibility) {
      const icmResponsibilities = Array.isArray(icmData.items.Responsibility)
        ? icmData.items.Responsibility
        : [icmData.items.Responsibility]
      const hasRWAccess = icmResponsibilities.some(
        (r) => normalize(r.Name) === 'ICM CSA APPLICATION - RW',
      )
      const hasROAccess = icmResponsibilities.some(
        (r) => normalize(r.Name) === 'ICM CSA APPLICATION - RO',
      )

      if (hasRWAccess) {
        responsibilities.push('csa_user', 'admin')
      } else if (hasROAccess) {
        responsibilities.push('csa_user', 'reviewer')
      }
    }

    return responsibilities
  }
}

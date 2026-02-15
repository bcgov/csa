import { HttpService } from '@nestjs/axios'
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as jwt from 'jsonwebtoken'
import { firstValueFrom } from 'rxjs'
import { KeycloakAuthService } from 'src/common/auth/keycloak-auth.service'
import { UserInfoDto } from './dto/user-info.dto'
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
  /**
   * Decode JWT token and extract user information
   * @param token - JWT token from Authorization header
   * @returns UserInfoDto with decoded user information
   */
  decodeToken(token: string): UserInfoDto {
    try {
      // Remove 'Bearer ' prefix if present
      const cleanToken = token.replace(/^Bearer\s+/i, '')

      // Decode without verification (since we're not validating signature here)
      // In production, you should verify the token with the public key
      const decoded = jwt.decode(cleanToken) as any

      if (!decoded) {
        throw new UnauthorizedException('Invalid token')
      }

      // TODO: debug Tokens
      // Log token fields to see available username formats
      // console.log('Token fields:', {
      //   idir_username: decoded.idir_username,
      //   preferred_username: decoded.preferred_username,
      //   email: decoded.email,
      //   sub: decoded.sub,
      // })

      // Extract username - prefer idir_username, then extract from preferred_username
      let username = decoded.idir_username
      if (!username && decoded.preferred_username) {
        // Extract short username from formats like "plakkara@idir" or "plakkara@gov.bc.ca"
        username = decoded.preferred_username.split('@')[0]
      }
      username = username || decoded.email?.split('@')[0] || decoded.sub || 'unknown'

      // Extract common Keycloak token fields
      const userInfo: UserInfoDto = {
        username: username.toUpperCase(), // ICM often expects uppercase
        email: decoded.email,
        firstName: decoded.given_name,
        lastName: decoded.family_name,
        sub: decoded.sub,
        exp: decoded.exp,
      }

      return userInfo
    } catch {
      throw new UnauthorizedException('Failed to decode token')
    }
  }

  /**
   * Extract username from JWT token
   * @param token - JWT token from Authorization header
   * @returns Username string
   */
  extractUsername(token: string): string {
    const userInfo = this.decodeToken(token)
    return userInfo.username
  }

  /**
   * Get user permissions and responsibilities from ICM API
   * @param username - User's username
   * @returns UserPermissionsDto with permissions and responsibilities
   */
  async getUserPermissions(username: string): Promise<UserPermissionsDto> {
    try {
      const icmData = await this.fetchUserFromICM(username)

      // Extract permissions from ICM response
      const permissions = this.extractPermissionsFromICMData(icmData)
      const responsibilities = this.extractResponsibilitiesFromICMData(icmData)

      return {
        username,
        permissions,
        responsibilities,
        retrievedAt: new Date().toISOString(),
      }
    } catch (error) {
      this.logger.warn('Failed to fetch user permissions from ICM, using fallback', error)
      // Fallback to mock permissions if ICM fails
      const mockPermissions = this.getMockPermissions(username)
      return {
        username,
        permissions: mockPermissions.permissions,
        responsibilities: mockPermissions.responsibilities,
        retrievedAt: new Date().toISOString(),
      }
    }
  }

  /**
   * Verify if user has CSA access by checking ICM for CSA Application responsibility
   * @param token - JWT token from Authorization header
   * @returns Object with access status, username, and details
   */
  async verifyCSAAccess(token: string): Promise<{
    hasAccess: boolean
    username: string
    userInfo: UserInfoDto
    message: string
    icmResponsibility?: string
  }> {
    const userInfo = this.decodeToken(token)
    const username = userInfo.username

    try {
      const icmData = await this.fetchUserFromICM(username)

      // Check if user has ICM CSA Application responsibility (RW or RO)
      let hasCSAResponsibility = false
      let icmResponsibilityName: string | undefined

      if (icmData?.items?.Responsibility && Array.isArray(icmData.items.Responsibility)) {
        const responsibilities = icmData.items.Responsibility
        const rwResponsibility = responsibilities.find((r) => r.Name === 'ICM CSA Application - RW')
        const roResponsibility = responsibilities.find((r) => r.Name === 'ICM CSA Application - RO')

        if (rwResponsibility || roResponsibility) {
          hasCSAResponsibility = true
          icmResponsibilityName = rwResponsibility?.Name || roResponsibility?.Name
        }
      }

      if (hasCSAResponsibility) {
        return {
          hasAccess: true,
          username,
          userInfo,
          message: 'User has CSA access',
          icmResponsibility: icmResponsibilityName,
        }
      }

      return {
        hasAccess: false,
        username,
        userInfo,
        message: 'User does not have ICM CSA Application responsibility',
      }
    } catch (error) {
      console.error('Failed to verify CSA access from ICM:', error)
      // Return unauthorized if ICM check fails
      return {
        hasAccess: false,
        username,
        userInfo,
        message: 'Failed to verify user access from ICM system',
      }
    }
  }

  /**
   * Get user permissions from token
   * Combines token decoding and permission retrieval
   * @param token - JWT token from Authorization header
   * @returns UserPermissionsDto with permissions and responsibilities
   */
  async getPermissionsFromToken(token: string): Promise<UserPermissionsDto> {
    const username = this.extractUsername(token)
    return this.getUserPermissions(username)
  }

  /**
   * Mock permissions generator
   * TODO: Replace with ICM integration
   * @param username - User's username
   * @returns Mock permissions and responsibilities
   */
  private getMockPermissions(username: string): {
    permissions: PermissionDto[]
    responsibilities: string[]
  } {
    // Mock data - different permissions based on username pattern
    const isAdmin = username.toLowerCase().includes('admin')
    const isReviewer = username.toLowerCase().includes('reviewer')

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

    if (isAdmin) {
      return {
        permissions: [
          ...basePermissions,
          {
            id: 'applicants.write',
            name: 'Write Applicants',
            description: 'Create and update applicant information',
            resource: 'applicants',
            action: 'write',
          },
          {
            id: 'applicants.delete',
            name: 'Delete Applicants',
            description: 'Delete applicant records',
            resource: 'applicants',
            action: 'delete',
          },
          {
            id: 'batches.write',
            name: 'Write Batches',
            description: 'Create and update batches',
            resource: 'batches',
            action: 'write',
          },
          {
            id: 'batches.delete',
            name: 'Delete Batches',
            description: 'Delete batch records',
            resource: 'batches',
            action: 'delete',
          },
          {
            id: 'admin.access',
            name: 'Admin Access',
            description: 'Full administrative access',
            resource: 'admin',
            action: 'all',
          },
        ],
        responsibilities: ['admin', 'approver', 'reviewer'],
      }
    }

    if (isReviewer) {
      return {
        permissions: [
          ...basePermissions,
          {
            id: 'applicants.review',
            name: 'Review Applicants',
            description: 'Review and comment on applications',
            resource: 'applicants',
            action: 'review',
          },
          {
            id: 'batches.review',
            name: 'Review Batches',
            description: 'Review batch submissions',
            resource: 'batches',
            action: 'review',
          },
        ],
        responsibilities: ['reviewer'],
      }
    }

    // Default user permissions
    return {
      permissions: basePermissions,
      responsibilities: ['user'],
    }
  }

  /**
   * Verify if user has specific permission
   * @param username - User's username
   * @param permissionId - Permission ID to check
   * @returns boolean indicating if user has the permission
   */
  async hasPermission(username: string, permissionId: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(username)
    return userPermissions.permissions.some((p) => p.id === permissionId)
  }

  /**
   * Verify if user has specific responsibility/role
   * @param username - User's username
   * @param responsibility - Responsibility/role to check
   * @returns boolean indicating if user has the responsibility
   */
  async hasResponsibility(username: string, responsibility: string): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(username)
    return userPermissions.responsibilities.includes(responsibility)
  }

  /**
   * Fetch user data from ICM API
   * @param username - User's username
   * @returns ICM API response data
   */
  async fetchUserFromICM(username: string): Promise<ICMEmployeeResponse> {
    try {
      // Step 1: Get Bearer token from Keycloak
      this.logger.log('Fetching ICM bearer token...')
      const bearerToken = await this.keycloakAuthService.getBearerToken()

      this.logger.log('Requesting ICM API with username:', username)

      const icmApiUrl = this.configService.get<string>('admin.icmApiUrl')!
      const icmTrustedUsername = this.configService.get<string>('admin.icmTrustedUsername')!

      // Build QueryHierarchy parameter
      const queryHierarchy = {
        Employee: {
          fields: 'Login Name, Party Name',
          searchspec: "[Login Name] = 'UKHAN'",
          // searchspec: `[Login Name] = '${username}'`,
          Responsibility: {
            fields: 'Name',
            searchspec:
              "[Name] = 'ICM CSA Application - RW' OR [Name] = 'ICM CSA Application - RO'",
          },
        },
      }

      // Build query parameters
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
            'X-ICM-TrustedUsername': icmTrustedUsername,
          },
        }),
      )
      this.logger.log('ICM API response received:', response.data)

      return response.data
    } catch (error) {
      console.error('ICM API request failed:', error)
      throw new HttpException(
        'Failed to fetch user data from ICM',
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  /**
   * Extract permissions from ICM API response
   * @param icmData - ICM API response data
   * @returns Array of PermissionDto
   */
  private extractPermissionsFromICMData(icmData: ICMEmployeeResponse): PermissionDto[] {
    // Default permissions based on ICM data
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

    // Check if user has ICM CSA Application responsibility
    if (icmData?.items?.Responsibility && Array.isArray(icmData.items.Responsibility)) {
      const responsibilities = icmData.items.Responsibility
      const hasRWAccess = responsibilities.some((r) => r.Name === 'ICM CSA Application - RW')
      const hasROAccess = responsibilities.some((r) => r.Name === 'ICM CSA Application - RO')

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
        // Read-only CSA access - no additional write permissions
      }
    }

    return basePermissions
  }

  /**
   * Extract responsibilities from ICM API response
   * @param icmData - ICM API response data
   * @returns Array of responsibility strings
   */
  private extractResponsibilitiesFromICMData(icmData: ICMEmployeeResponse): string[] {
    const responsibilities = ['user'] // Default responsibility

    if (icmData?.items?.Responsibility && Array.isArray(icmData.items.Responsibility)) {
      const icmResponsibilities = icmData.items.Responsibility
      const hasRWAccess = icmResponsibilities.some((r) => r.Name === 'ICM CSA Application - RW')
      const hasROAccess = icmResponsibilities.some((r) => r.Name === 'ICM CSA Application - RO')

      if (hasRWAccess) {
        responsibilities.push('csa_user', 'admin')
      } else if (hasROAccess) {
        responsibilities.push('csa_user', 'reviewer')
      }
    }

    return responsibilities
  }
}

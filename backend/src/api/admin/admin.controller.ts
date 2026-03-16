import {
  Controller,
  Get,
  HttpException,
  Param,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { toUserInfoDto } from 'src/common/auth/token-utils'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { DecodedToken } from '../common/decorators/decoded-token.decorator'
import { SkipCSACheck } from '../common/decorators/skip-csa-check.decorator'
import { CSAGuard } from '../common/guards/csa.guard'
import { AdminService } from './admin.service'
import { UserInfoDto } from './dto/user-info.dto'
import { UserPermissionsDto } from './dto/user-permissions.dto'

@ApiTags('admin')
@Controller({ path: 'admin', version: '1' })
@UseGuards(CSAGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('user/info')
  @ApiOperation({
    summary: 'Get user information from token',
    description:
      'Returns user information including username, email, and other profile data from the authenticated token',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token from Keycloak authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'User information successfully retrieved',
    type: UserInfoDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  getUserInfo(
    @CurrentUser() username: string,
    @DecodedToken() decoded: Record<string, unknown>,
  ): UserInfoDto {
    return toUserInfoDto(decoded, username)
  }

  @Get('user/permissions')
  @ApiOperation({
    summary: 'Get user permissions from token',
    description: 'Returns all permissions and responsibilities for the authenticated user',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token from Keycloak authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'User permissions successfully retrieved',
    type: UserPermissionsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async getPermissionsFromToken(@CurrentUser() username: string): Promise<UserPermissionsDto> {
    return this.adminService.getUserPermissions(username)
  }

  @Get('permissions/:username')
  @ApiOperation({
    summary: 'Get permissions by username',
    description:
      'Retrieves permissions and responsibilities for a specific username (requires authentication)',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token from Keycloak authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'User permissions successfully retrieved',
    type: UserPermissionsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async getPermissionsByUsername(
    @CurrentUser() username: string,
    @Param('username') targetUsername: string,
  ): Promise<UserPermissionsDto> {
    const hasAdminAccess = await this.adminService.hasResponsibility(username, 'admin')

    if (!hasAdminAccess) {
      throw new UnauthorizedException('Admin access required to view other user permissions')
    }

    return this.adminService.getUserPermissions(targetUsername)
  }

  @Get('check/permission')
  @ApiOperation({
    summary: 'Check if user has specific permission',
    description: 'Verifies if the authenticated user has a specific permission',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token from Keycloak authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Permission check result',
    schema: {
      properties: {
        hasPermission: { type: 'boolean' },
        username: { type: 'string' },
        permissionId: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async checkPermission(
    @CurrentUser() username: string,
    @Query('permissionId') permissionId: string,
  ): Promise<{ hasPermission: boolean; username: string; permissionId: string }> {
    if (!permissionId) {
      throw new HttpException('permissionId query parameter is required', 400)
    }

    const hasPermission = await this.adminService.hasPermission(username, permissionId)

    return {
      hasPermission,
      username,
      permissionId,
    }
  }

  @Get('check/responsibility')
  @ApiOperation({
    summary: 'Check if user has specific responsibility/role',
    description: 'Verifies if the authenticated user has a specific responsibility or role',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token from Keycloak authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Responsibility check result',
    schema: {
      properties: {
        hasResponsibility: { type: 'boolean' },
        username: { type: 'string' },
        responsibility: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async checkResponsibility(
    @CurrentUser() username: string,
    @Query('responsibility') responsibility: string,
  ): Promise<{
    hasResponsibility: boolean
    username: string
    responsibility: string
  }> {
    if (!responsibility) {
      throw new HttpException('responsibility query parameter is required', 400)
    }

    const hasResponsibility = await this.adminService.hasResponsibility(username, responsibility)

    return {
      hasResponsibility,
      username,
      responsibility,
    }
  }

  @Get('verify-csa-access')
  @SkipCSACheck() // This endpoint verifies CSA access itself, so skip the guard check
  @ApiOperation({
    summary: 'Verify user has CSA access',
    description:
      'Verifies the authenticated user has CSA Application responsibility by querying ICM',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token from Keycloak authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'CSA access verification result',
    schema: {
      properties: {
        hasAccess: { type: 'boolean' },
        username: { type: 'string' },
        userInfo: { type: 'object' },
        message: { type: 'string' },
        icmResponsibility: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid, expired, or missing token',
  })
  async verifyCSAAccess(
    @CurrentUser() username: string,
    @DecodedToken() decoded: Record<string, unknown>,
  ): Promise<{
    hasAccess: boolean
    username: string
    userInfo: UserInfoDto
    message: string
    icmResponsibility?: string
  }> {
    const result = await this.adminService.verifyCSAAccess(username)
    return {
      ...result,
      username,
      userInfo: toUserInfoDto(decoded, username),
    }
  }

  @Get('user/icm-data')
  @ApiOperation({
    summary: 'Get user data from ICM system',
    description: 'Fetches user data from ICM API for the authenticated user',
  })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token from Keycloak authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'User ICM data successfully retrieved',
    schema: {
      properties: {
        username: { type: 'string' },
        icmData: { type: 'object' },
        retrievedAt: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error - Failed to fetch ICM data',
  })
  async getUserICMData(
    @CurrentUser() username: string,
  ): Promise<{ username: string; icmData: any; retrievedAt: string }> {
    const icmData = await this.adminService.fetchUserFromICM(username)

    return {
      username,
      icmData,
      retrievedAt: new Date().toISOString(),
    }
  }
}

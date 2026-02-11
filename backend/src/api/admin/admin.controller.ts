import {
  Controller,
  Get,
  Headers,
  HttpException,
  Param,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AuthGuard } from '../common/guards/auth.guard'
import { AdminService } from './admin.service'
import { UserInfoDto } from './dto/user-info.dto'
import { UserPermissionsDto } from './dto/user-permissions.dto'

@ApiTags('admin')
@Controller({ path: 'admin', version: '1' })
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('user/info')
  @ApiOperation({
    summary: 'Get user information from token',
    description:
      'Decodes the JWT token and returns user information including username, email, and other profile data',
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
  getUserInfo(@Headers('authorization') authHeader: string): UserInfoDto {
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required')
    }

    return this.adminService.decodeToken(authHeader)
  }

  @Get('user/permissions')
  @ApiOperation({
    summary: 'Get user permissions from token',
    description:
      'Decodes the JWT token, extracts username, and returns all permissions and responsibilities for the user',
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
  async getPermissionsFromToken(
    @Headers('authorization') authHeader: string,
  ): Promise<UserPermissionsDto> {
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required')
    }

    return this.adminService.getPermissionsFromToken(authHeader)
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
    @Headers('authorization') authHeader: string,
    @Param('username') username: string,
  ): Promise<UserPermissionsDto> {
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required')
    }

    // Verify the requesting user has admin access
    const requestingUser = this.adminService.extractUsername(authHeader)
    const hasAdminAccess = await this.adminService.hasResponsibility(requestingUser, 'admin')

    if (!hasAdminAccess) {
      throw new UnauthorizedException('Admin access required to view other user permissions')
    }

    return this.adminService.getUserPermissions(username)
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
    @Headers('authorization') authHeader: string,
    @Query('permissionId') permissionId: string,
  ): Promise<{ hasPermission: boolean; username: string; permissionId: string }> {
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required')
    }

    if (!permissionId) {
      throw new HttpException('permissionId query parameter is required', 400)
    }

    const username = this.adminService.extractUsername(authHeader)
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
    @Headers('authorization') authHeader: string,
    @Query('responsibility') responsibility: string,
  ): Promise<{
    hasResponsibility: boolean
    username: string
    responsibility: string
  }> {
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required')
    }

    if (!responsibility) {
      throw new HttpException('responsibility query parameter is required', 400)
    }

    const username = this.adminService.extractUsername(authHeader)
    const hasResponsibility = await this.adminService.hasResponsibility(username, responsibility)

    return {
      hasResponsibility,
      username,
      responsibility,
    }
  }

  @Get('verify-csa-access')
  @ApiOperation({
    summary: 'Verify user has CSA access',
    description:
      'Validates the auth token, extracts username, and queries ICM to verify user has CSA Application responsibility',
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
  async verifyCSAAccess(@Headers('authorization') authHeader: string): Promise<{
    hasAccess: boolean
    username: string
    userInfo: UserInfoDto
    message: string
    icmResponsibility?: string
  }> {
    return this.adminService.verifyCSAAccess(authHeader)
  }

  @Get('user/icm-data')
  @ApiOperation({
    summary: 'Get user data from ICM system',
    description: 'Decodes the JWT token, extracts username, and fetches user data from ICM API',
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
    @Headers('authorization') authHeader: string,
  ): Promise<{ username: string; icmData: any; retrievedAt: string }> {
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required')
    }

    const username = this.adminService.extractUsername(authHeader)
    const icmData = await this.adminService.fetchUserFromICM(username)

    return {
      username,
      icmData,
      retrievedAt: new Date().toISOString(),
    }
  }
}

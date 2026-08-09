import { Controller, Get, Req, UseGuards } from '@nestjs/common'
import type { Request as ExpressRequest } from 'express'
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { toUserInfoDto } from 'src/common/auth/token-utils'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { DecodedToken } from '../common/decorators/decoded-token.decorator'
import { SkipCSACheck } from '../common/decorators/skip-csa-check.decorator'
import { CSAGuard } from '../common/guards/csa.guard'
import { AdminService } from './admin.service'
import { UserInfoDto } from './dto/user-info.dto'

@ApiTags('admin')
@Controller({ path: 'admin', version: '1' })
@UseGuards(CSAGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
    @Req() request: ExpressRequest,
  ): Promise<{
    hasAccess: boolean
    username: string
    userInfo: UserInfoDto
    message: string
    userProfile?: string
    icmResponsibility?: string
  }> {
    const result = await this.adminService.verifyCSAAccess(
      username,
      (request as any).userProfile,
    )
    return {
      ...result,
      username,
      userInfo: toUserInfoDto(decoded, username),
    }
  }
}

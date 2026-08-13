import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { CSAGuard } from '../common/guards/csa.guard'
import { AuditTrailService } from './audit-trail.service'
import { ContactAuditTrailDto } from './dto/contact-audit-trail.dto'

@ApiTags('audit-trail')
@Controller('audit-trail')
@UseGuards(CSAGuard)
export class AuditTrailController {
  constructor(private readonly auditTrailService: AuditTrailService) {}

  private parsePage(page?: string): number {
    const parsed = page ? parseInt(page, 10) : 1
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
  }

  private parseLimit(limit?: string): number {
    const parsed = limit ? parseInt(limit, 10) : 10
    return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 200) : 10
  }

  private parseContactId(contactId?: string): number | undefined {
    if (!contactId) return undefined
    const parsed = parseInt(contactId, 10)
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : undefined
  }

  @Get()
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10, max: 200)',
  })
  @ApiQuery({
    name: 'contactId',
    required: false,
    type: Number,
    description: 'Optional filter by contact ID',
  })
  @ApiResponse({ status: 200, description: 'Paginated CSA audit trail (most recent first)' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('contactId') contactId?: string,
  ): Promise<PaginatedResponse<ContactAuditTrailDto>> {
    return this.auditTrailService.findAll(
      this.parsePage(page),
      this.parseLimit(limit),
      this.parseContactId(contactId),
    )
  }
}

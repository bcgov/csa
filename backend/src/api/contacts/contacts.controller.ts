import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { CurrentUser } from '../common/decorators'
import { ContactIdsDto, ContactIdsWithActionDto } from '../common/dto/contact-ids.dto'
import { CSAGuard } from '../common/guards/csa.guard'
import { ContactsService } from './contacts.service'
import { ContactDto } from './dto/contact.dto'
import { BulkOperationResponse } from './interfaces'

@ApiTags('contacts')
@Controller('contacts')
@UseGuards(CSAGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  private parsePage(page?: string): number {
    const parsed = page ? parseInt(page, 10) : 1
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
  }

  private parseLimit(limit?: string): number {
    const parsed = limit ? parseInt(limit, 10) : 10
    return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 200) : 10
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
    name: 'sort',
    required: false,
    type: String,
    description:
      'JSON array of sort objects: [{"field":"asc|desc"}]. Example: [{"lastName":"desc"},{"firstName":"asc"}]',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    type: String,
    description:
      'JSON array of filter conditions: [{"key":"field","op":"operation","value":"val"}]. Operations: eq, neq, like, gt, gte, lt, lte, in, notin, isnull, notnull, isblank, notblank. Supports OR logic: {"OR":[...]}',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of contacts' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('filter') filter?: string,
  ): Promise<PaginatedResponse<ContactDto>> {
    return this.contactsService.findAll(this.parsePage(page), this.parseLimit(limit), sort, filter)
  }

  @Get('search') // must be ahead of Get(":id") to avoid conflict
  @ApiQuery({
    name: 'q',
    required: true,
    type: String,
    description: 'Search query for full-text search',
  })
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
  @ApiResponse({ status: 200, description: 'Paginated search results' })
  @ApiResponse({ status: 400, description: 'Search query is required' })
  async searchContacts(
    @Query('q') q: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponse<ContactDto>> {
    if (!q || q.trim() === '') {
      throw new HttpException('Search query is required', 400)
    }
    if (q.trim().length < 2) {
      throw new HttpException('Search query must be at least 2 characters', 400)
    }
    return this.contactsService.fullTextSearch(q, this.parsePage(page), this.parseLimit(limit))
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const user = await this.contactsService.findOne(id)
    if (!user) {
      throw new HttpException('User not found.', 404)
    }
    return user
  }

  @Post('hold')
  @ApiResponse({ status: 200, description: 'Bulk hold result with success and failed arrays' })
  async holdContacts(
    @Body() dto: ContactIdsDto,
    @CurrentUser() userId: string,
  ): Promise<BulkOperationResponse> {
    return this.contactsService.holdContacts(dto.contactIds, userId)
  }

  @Post('resume')
  @ApiResponse({ status: 200, description: 'Bulk resume result with success and failed arrays' })
  async resumeContacts(
    @Body() dto: ContactIdsDto,
    @CurrentUser() userId: string,
  ): Promise<BulkOperationResponse> {
    return this.contactsService.resumeContacts(dto.contactIds, userId)
  }

  @Post('set-eligible')
  @ApiResponse({
    status: 200,
    description: 'Bulk eligibility status update result with success and failed arrays',
  })
  async updateEligibilityStatus(
    @Body() dto: ContactIdsWithActionDto,
    @CurrentUser() userId: string,
  ): Promise<BulkOperationResponse> {
    return this.contactsService.updateEligibilityStatus(dto.contactIds, dto.action, userId)
  }

  @Post('set-not-eligible')
  @ApiResponse({
    status: 200,
    description: 'Bulk not eligible status update result with success and failed arrays',
  })
  async updateNotEligibleStatus(
    @Body() dto: ContactIdsWithActionDto,
    @CurrentUser() userId: string,
  ): Promise<BulkOperationResponse> {
    return this.contactsService.updateNotEligibleStatus(dto.contactIds, dto.action, userId)
  }

  @Post('age-out')
  @ApiResponse({
    status: 200,
    description: 'Bulk child over 18 status update result with success and failed arrays',
  })
  async updateChildOver18(
    @Body() dto: ContactIdsWithActionDto,
    @CurrentUser() userId: string,
  ): Promise<BulkOperationResponse> {
    return this.contactsService.updateChildOver18(dto.contactIds, dto.action, userId)
  }

  @Get(':id/batches')
  @ApiResponse({ status: 200, description: 'List of batch details for this contact' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async findContactBatches(@Param('id', ParseIntPipe) id: number) {
    return this.contactsService.findContactBatches(id)
  }

  @Post(':id/run-eligibility')
  @HttpCode(200)
  @ApiResponse({ status: 200, description: 'Eligibility result with previous and new status' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  @ApiResponse({ status: 422, description: 'Contact not found in staging tables' })
  async runEligibility(@Param('id', ParseIntPipe) id: number) {
    return this.contactsService.runContactEligibility(id)
  }
}

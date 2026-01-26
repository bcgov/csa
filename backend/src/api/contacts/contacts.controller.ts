import { Controller, Get, HttpException, Param, Query } from '@nestjs/common'
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { ContactsService } from './contacts.service'
import { ContactDto } from './dto/contact.dto'

@ApiTags('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

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
    const pageNum = page ? parseInt(page, 10) : 1
    const limitNum = limit ? parseInt(limit, 10) : 10
    return this.contactsService.findAll(pageNum, limitNum, sort, filter)
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
    const pageNum = page ? parseInt(page, 10) : 1
    const limitNum = limit ? parseInt(limit, 10) : 10
    return this.contactsService.fullTextSearch(q, pageNum, limitNum)
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.contactsService.findOne(+id)
    if (!user) {
      throw new HttpException('User not found.', 404)
    }
    return user
  }
}

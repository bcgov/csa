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
  @ApiResponse({ status: 200, description: 'Paginated list of contacts' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponse<ContactDto>> {
    const pageNum = page ? parseInt(page, 10) : 1
    const limitNum = limit ? parseInt(limit, 10) : 10
    return this.contactsService.findAll(pageNum, limitNum)
  }

  @Get('search') // it must be ahead of the below Get(":id") to avoid conflict
  async searchContacts(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sort') sort: string, // JSON string to store sort key and sort value, ex: {name: "ASC"}
    @Query('filter') filter: string, // JSON array for key, operation and value, ex: [{key: "name", operation: "like", value: "Peter"}]
  ) {
    if (isNaN(page) || isNaN(limit)) {
      throw new HttpException('Invalid query parameters', 400)
    }
    return this.contactsService.searchContacts(page, limit, sort, filter)
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

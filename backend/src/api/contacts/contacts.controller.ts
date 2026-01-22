import { Controller, Get, HttpException, Param, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ContactsService } from './contacts.service'
import { ContactDto } from './dto/contact.dto'

@ApiTags('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  findAll(): Promise<ContactDto[]> {
    return this.contactsService.findAll()
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

import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AddContactsDto } from '../batches/dto/add-contact.dto'
import { CSAGuard } from '../common/guards/csa.guard'
import { BatchesService } from './batches.service'

@ApiTags('batches')
@Controller('batches')
@UseGuards(CSAGuard)
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) { }

  @Get()
  @ApiResponse({ status: 200, description: 'List of all batches' })
  findAll() {
    return this.batchesService.findAll()
  }

  // To prevent routing conflicts, 'GET /pending' comes before 'GET /:id'
  @Get('pending')
  @ApiResponse({ status: 200, description: 'Get or create pending batch' })
  findOrCreatePending() {
    return this.batchesService.findOrCreatePendingBatch()
  }

  @Post('pending/contacts')
  @ApiBody({ type: AddContactsDto })
  @ApiResponse({ status: 201, description: 'Contacts added to pending batch' })
  async addContactsToPending(@Body() dto: AddContactsDto) {
    // TODO: Get userId from auth context when authentication is implemented
    const userId = 'system'
    return this.batchesService.addContactsToPendingBatch(dto.contactIds, userId)
  }

  @Delete('pending/contacts/:contactId')
  @HttpCode(204)
  @ApiResponse({ status: 204, description: 'Contact removed from pending batch' })
  @ApiResponse({ status: 404, description: 'Contact not found in pending batch' })
  async removeContactFromPending(@Param('contactId') contactId: string) {
    await this.batchesService.removeContactFromPendingBatch(+contactId)
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Batch details' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  findOne(@Param('id') id: string) {
    return this.batchesService.findOne(+id)
  }

  @Get(':id/contacts')
  @ApiResponse({ status: 200, description: 'List of contacts in this batch' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  findBatchContacts(@Param('id') id: string) {
    return this.batchesService.findBatchContacts(+id)
  }
}

import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger'
import { CSAGuard } from '../common/guards/csa.guard'
import {
  UpdateBatchStatusDto,
  UpdateContactStatusDto,
  UpdateEligibilityStatusDto,
} from './dto/update-status.dto'
import { StatusUpdateService } from './status-update.service'

@ApiTags('status-update')
@Controller('status-update')
@UseGuards(CSAGuard)
export class StatusUpdateController {
  constructor(private readonly statusUpdateService: StatusUpdateService) { }

  @Patch('contact')
  @ApiBody({ type: UpdateContactStatusDto })
  @ApiResponse({ status: 200, description: 'Contact status updated successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async updateContactStatus(@Body() dto: UpdateContactStatusDto) {
    return this.statusUpdateService.updateContactStatus(dto)
  }

  @Patch('batch')
  @ApiBody({ type: UpdateBatchStatusDto })
  @ApiResponse({ status: 200, description: 'Batch status updated successfully' })
  @ApiResponse({ status: 404, description: 'Batch not found' })
  async updateBatchStatus(@Body() dto: UpdateBatchStatusDto) {
    return this.statusUpdateService.updateBatchStatus(dto)
  }

  @Get('contact/statuses')
  @ApiResponse({ status: 200, description: 'List of available contact statuses' })
  async getContactStatuses() {
    return this.statusUpdateService.getContactStatuses()
  }

  @Get('batch/statuses')
  @ApiResponse({ status: 200, description: 'List of available batch statuses' })
  async getBatchStatuses() {
    return this.statusUpdateService.getBatchStatuses()
  }

  @Post('eligibility')
  @ApiBody({ type: UpdateEligibilityStatusDto })
  @ApiResponse({
    status: 200,
    description:
      'Bulk eligibility status update result with success and failed arrays. Updates: "not_eligible_out_of_pay" → "eligible_tbd" and "not_eligible_ip_tbd" → "in_pay"',
  })
  async updateEligibilityStatus(@Body() dto: UpdateEligibilityStatusDto) {
    return this.statusUpdateService.updateEligibilityStatus(dto)
  }

  @Post('not-eligible')
  @ApiBody({ type: UpdateEligibilityStatusDto })
  @ApiResponse({
    status: 200,
    description:
      'Bulk not eligible status update result with success and failed arrays. Updates: "eligible_tbd", "in_pay", or "on_hold" → "not_eligible_ip_tbd"',
  })
  async updateNotEligibleStatus(@Body() dto: UpdateEligibilityStatusDto) {
    return this.statusUpdateService.updateNotEligibleStatus(dto)
  }

  @Post('not-eligible-alt')
  @ApiBody({ type: UpdateEligibilityStatusDto })
  @ApiResponse({
    status: 200,
    description:
      'Bulk not eligible status update with alternative transitions. Updates: "eligible_tbd" or "on_hold" → "not_eligible_out_of_pay", "in_pay" → "not_eligible_ip_tbd"',
  })
  async updateNotEligibleStatusAlt(@Body() dto: UpdateEligibilityStatusDto) {
    return this.statusUpdateService.updateNotEligibleStatusAlt(dto)
  }

  @Post('over-18')
  @ApiBody({ type: UpdateEligibilityStatusDto })
  @ApiResponse({
    status: 200,
    description:
      'Bulk status update to Over 18. Updates: "eligible_tbd" or "not_eligible_ip_tbd" → "Over 18"',
  })
  async updateOver18Status(@Body() dto: UpdateEligibilityStatusDto) {
    return this.statusUpdateService.updateOver18Status(dto)
  }
}

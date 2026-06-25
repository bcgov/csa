import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBody, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { PaginatedResponse } from 'src/api/common/dto/paginated-response.dto'
import { CurrentUser } from '../common/decorators'
import { CSAGuard } from '../common/guards/csa.guard'
import { AssociateWklRecordDto, ReprocessWeeklyFileResultDto } from './dto/associate-wkl-record.dto'
import { WeeklyFileRecordDto, WeeklyFileSummaryDto } from './dto/weekly-file.dto'
import { WeeklyFilesService } from './weekly-files.service'

@ApiTags('weekly-files')
@Controller('weekly-files')
@UseGuards(CSAGuard)
export class WeeklyFilesController {
  constructor(private readonly weeklyFilesService: WeeklyFilesService) {}

  private parsePage(page?: string): number {
    const parsed = page ? parseInt(page, 10) : 1
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
  }

  private parseLimit(limit?: string): number {
    const parsed = limit ? parseInt(limit, 10) : 10
    return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 200) : 10
  }

  @Get()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated weekly file report summaries' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponse<WeeklyFileSummaryDto>> {
    return this.weeklyFilesService.findAll(this.parsePage(page), this.parseLimit(limit))
  }

  @Get(':id/records')
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'csaMatchFound',
    required: false,
    type: String,
    description: 'Comma-separated filter values for CSA Match Found: "Yes" and/or "No"',
  })
  @ApiQuery({
    name: 'transactionType',
    required: false,
    type: String,
    description:
      'Comma-separated normalized transaction type labels: "Application", "Cancellation", "Update"',
  })
  @ApiQuery({
    name: 'craStatus',
    required: false,
    type: String,
    description:
      'Comma-separated normalized CRA status labels: "COMPLETED", "ABANDONED", "IN PROGRESS", "UPDATED"',
  })
  @ApiQuery({
    name: 'matchedBy',
    required: false,
    type: String,
    description: 'Text filter for Matched By (minimum 3 characters)',
  })
  @ApiQuery({
    name: 'batchNumber',
    required: false,
    type: String,
    description: 'Text filter for Batch Req ID / batch number (minimum 3 characters)',
  })
  @ApiQuery({
    name: 'transactionSource',
    required: false,
    type: String,
    description: 'Text filter for Transaction Source (minimum 3 characters)',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    type: String,
    description:
      'JSON array of sort objects: [{"field":"asc|desc"}]. Example: [{"craStatus":"asc"}]. Allowed fields: csaMatchFound, matchedBy, batchNumber, transactionType, transactionSource, craStatus',
  })
  @ApiResponse({ status: 200, description: 'Paginated detail records for a weekly file' })
  @ApiResponse({ status: 404, description: 'Weekly file not found' })
  findRecords(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('csaMatchFound') csaMatchFound?: string,
    @Query('transactionType') transactionType?: string,
    @Query('craStatus') craStatus?: string,
    @Query('matchedBy') matchedBy?: string,
    @Query('batchNumber') batchNumber?: string,
    @Query('transactionSource') transactionSource?: string,
    @Query('sort') sort?: string,
  ): Promise<PaginatedResponse<WeeklyFileRecordDto>> {
    const filters = {
      csaMatchFound: csaMatchFound
        ? csaMatchFound
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : undefined,
      transactionType: transactionType
        ? transactionType
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : undefined,
      craStatus: craStatus
        ? craStatus
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : undefined,
      matchedBy: matchedBy?.trim() || undefined,
      batchNumber: batchNumber?.trim() || undefined,
      transactionSource: transactionSource?.trim() || undefined,
    }
    return this.weeklyFilesService.findRecords(
      id,
      this.parsePage(page),
      this.parseLimit(limit),
      filters,
      sort,
    )
  }

  @Post(':id/records/:recordId/associate')
  @HttpCode(200)
  @ApiBody({ type: AssociateWklRecordDto })
  @ApiResponse({ status: 200, description: 'Associated WKL record with contact' })
  associateRecord(
    @Param('id', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @Body() dto: AssociateWklRecordDto,
  ): Promise<WeeklyFileRecordDto> {
    return this.weeklyFilesService.associateRecord(id, recordId, dto.contactId)
  }

  @Post(':id/records/:recordId/dissociate')
  @HttpCode(200)
  @ApiResponse({ status: 200, description: 'Dissociated WKL record from contact' })
  dissociateRecord(
    @Param('id', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
  ): Promise<WeeklyFileRecordDto> {
    return this.weeklyFilesService.dissociateRecord(id, recordId)
  }

  @Post(':id/records/:recordId/reprocess')
  @HttpCode(200)
  @ApiResponse({
    status: 200,
    description: 'Confirmed (reprocessed) a single associated WKL record',
  })
  reprocessRecord(
    @Param('id', ParseIntPipe) id: number,
    @Param('recordId', ParseIntPipe) recordId: number,
    @CurrentUser() userId: string,
  ): Promise<WeeklyFileRecordDto> {
    return this.weeklyFilesService.reprocessRecord(id, recordId, userId)
  }

  @Post(':id/reprocess')
  @HttpCode(200)
  @ApiResponse({ status: 200, description: 'Reprocessed associated WKL records' })
  reprocess(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() userId: string,
  ): Promise<ReprocessWeeklyFileResultDto> {
    return this.weeklyFilesService.reprocess(id, userId)
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Weekly file summary' })
  @ApiResponse({ status: 404, description: 'Weekly file not found' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<WeeklyFileSummaryDto> {
    return this.weeklyFilesService.findOne(id)
  }
}

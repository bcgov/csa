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
  @ApiResponse({ status: 200, description: 'Paginated detail records for a weekly file' })
  @ApiResponse({ status: 404, description: 'Weekly file not found' })
  findRecords(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponse<WeeklyFileRecordDto>> {
    return this.weeklyFilesService.findRecords(id, this.parsePage(page), this.parseLimit(limit))
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

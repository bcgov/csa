import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ApplicantsService } from './applicants.service'
import { ApplicantDto } from './dto/applicant.dto'
import { CreateApplicantDto } from './dto/create-applicant.dto'
import { UpdateApplicantDto } from './dto/update-applicant.dto'

@ApiTags('applicants')
@Controller({ path: 'applicants', version: '1' })
export class ApplicantsController {
  constructor(private readonly applicantsService: ApplicantsService) {}

  @Post()
  create(@Body() createApplicantDto: CreateApplicantDto) {
    return this.applicantsService.create(createApplicantDto)
  }

  @Get()
  findAll(): Promise<ApplicantDto[]> {
    return this.applicantsService.findAll()
  }

  @Get('search') // it must be ahead of the below Get(":id") to avoid conflict
  async searchApplicants(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sort') sort: string, // JSON string to store sort key and sort value, ex: {name: "ASC"}
    @Query('filter') filter: string, // JSON array for key, operation and value, ex: [{key: "name", operation: "like", value: "Peter"}]
  ) {
    if (isNaN(page) || isNaN(limit)) {
      throw new HttpException('Invalid query parameters', 400)
    }
    return this.applicantsService.searchApplicants(page, limit, sort, filter)
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.applicantsService.findOne(+id)
    if (!user) {
      throw new HttpException('User not found.', 404)
    }
    return user
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateApplicantDto: UpdateApplicantDto) {
    return this.applicantsService.update(+id, updateApplicantDto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.applicantsService.remove(+id)
  }
}

import { Controller, Get, NotFoundException, Param } from '@nestjs/common'

import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { MockService } from './mock.service'

@ApiTags('mock')
@Controller('mock')
export class MockController {
  constructor(private readonly mockService: MockService) {}

  @Get()
  @ApiOperation({ summary: 'List available mock files' })
  listFiles() {
    return {
      files: this.mockService.listFiles(),

      usage: 'GET /api/mock/:filename to retrieve mock data',
    }
  }

  @Get(':filename')
  @ApiOperation({ summary: 'Get mock data from a JSON file' })
  getFile(@Param('filename') filename: string) {
    const data = this.mockService.getFile(filename)

    if (data === null) {
      throw new NotFoundException(`Mock file '${filename}.json' not found`)
    }

    return data
  }
}

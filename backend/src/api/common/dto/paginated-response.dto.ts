import { ApiProperty } from '@nestjs/swagger'

export class PaginatedResponse<T> {
  data: T[]

  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number

  @ApiProperty({ description: 'Number of items per page', example: 10 })
  limit: number

  @ApiProperty({ description: 'Total number of items', example: 150 })
  total: number

  @ApiProperty({ description: 'Total number of pages', example: 15 })
  totalPages: number
}

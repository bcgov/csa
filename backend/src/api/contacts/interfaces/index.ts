export type FilterOperation =
  | 'eq'
  | 'neq'
  | 'like'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'notin'
  | 'isnull'
  | 'notnull'
  | 'isblank'
  | 'notblank'

export interface FilterItem {
  key: string
  op: FilterOperation
  value?: unknown // Optional for isnull, notnull, isblank, notblank
}
export interface OrCondition {
  OR: FilterItem[]
}
export type FilterCondition = FilterItem | OrCondition

export interface BulkOperationResponse {
  success: number[]
  skipped: Array<{ id: number; reason: string }>
}

export interface UpdateCsaStatusOptions {
  userId?: string
  additionalData?: Record<string, unknown>
  // Prisma interactive transaction client — using any because Prisma doesn't export a usable TransactionClient type with @prisma/adapter-pg
  tx?: any
  // Caller context for logging (e.g. 'BatchesService.addContactsToPendingBatch')
  origin?: string
}

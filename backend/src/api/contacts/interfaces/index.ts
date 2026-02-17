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
}

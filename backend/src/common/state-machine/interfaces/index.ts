export type Actor = 'USER' | 'SYSTEM'

export type MachineType = 'csaStatus' | 'batch' | 'batchDetail'

export interface TransitionResult {
  success: boolean
  from?: string
  to?: string
  reason?: string
}

export interface BulkTransitionResult {
  succeeded: number[]
  failed: Array<{
    id: number
    reason: string
  }>
}

export interface Transition {
  event: string
  targetState: string
}

export interface StateConfig {
  statuses: Record<string, string>
  transitions: Record<string, Transition[]>
}

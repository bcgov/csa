export const CSA_STATUS = {
  ELIGIBLE: 'eligible',
  ELIGIBLE_TBD: 'eligible_tbd',
  NOT_ELIGIBLE_OUT_OF_PAY: 'not_eligible_out_of_pay',
  ON_HOLD: 'on_hold',
  IN_BATCH_APPLICATION: 'in_batch_application',
  BATCH_SENT_APPLICATION: 'batch_sent_application',
  APPLICATION_REFUSED_CRA: 'application_refused_cra',
  IN_PAY: 'in_pay',
  NOT_ELIGIBLE_IN_PAY: 'not_eligible_in_pay',
  NOT_ELIGIBLE_IP_TBD: 'not_eligible_ip_tbd',
  IN_BATCH_CANCELLATION: 'in_batch_cancellation',
  BATCH_SENT_CANCELLATION: 'batch_sent_cancellation',
  CANCELLATION_REFUSED_CRA: 'cancellation_refused_cra',
  OVER_18: 'over_18',
} as const

export type CsaStatus = (typeof CSA_STATUS)[keyof typeof CSA_STATUS]

export const CSA_STATUS_LABELS: Record<string, string> = {
  [CSA_STATUS.ELIGIBLE]: 'Eligible',
  [CSA_STATUS.ELIGIBLE_TBD]: 'Eligible - TBD',
  [CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY]: 'Not Eligible - Out of Pay',
  [CSA_STATUS.ON_HOLD]: 'On Hold',
  [CSA_STATUS.IN_BATCH_APPLICATION]: 'In Batch - Application',
  [CSA_STATUS.BATCH_SENT_APPLICATION]: 'Batch Sent - Application',
  [CSA_STATUS.APPLICATION_REFUSED_CRA]: 'Application Refused - CRA',
  [CSA_STATUS.IN_PAY]: 'In Pay',
  [CSA_STATUS.NOT_ELIGIBLE_IN_PAY]: 'Not Eligible - In Pay',
  [CSA_STATUS.NOT_ELIGIBLE_IP_TBD]: 'Not Eligible - IP - TBD',
  [CSA_STATUS.IN_BATCH_CANCELLATION]: 'In Batch - Cancellation',
  [CSA_STATUS.BATCH_SENT_CANCELLATION]: 'Batch Sent - Cancellation',
  [CSA_STATUS.CANCELLATION_REFUSED_CRA]: 'Cancellation Refused - CRA',
  [CSA_STATUS.OVER_18]: 'Over 18',
}

export const CSA_EVENT = {
  // User events (both USER and SYSTEM can trigger)
  ADD_TO_BATCH: 'ADD_TO_BATCH',
  REMOVE_FROM_BATCH: 'REMOVE_FROM_BATCH',
  SET_NOT_ELIGIBLE: 'SET_NOT_ELIGIBLE',
  SET_ELIGIBLE_TBD: 'SET_ELIGIBLE_TBD',
  HOLD: 'HOLD',
  RESUME: 'RESUME',
  // System events
  SEND_TO_CRA: 'SEND_TO_CRA',
  CRA_ACCEPTED: 'CRA_ACCEPTED',
  CRA_RECORD_REJECTED: 'CRA_RECORD_REJECTED',
  CRA_RECYCLED: 'CRA_RECYCLED',
  CRA_PROBLEM_DETECTED: 'CRA_PROBLEM_DETECTED',
  CRA_FILE_REJECTED: 'CRA_FILE_REJECTED',
  LOSE_PAY_ELIGIBILITY: 'LOSE_PAY_ELIGIBILITY',
  // Events with state-based actor permissions
  AGE_OUT: 'AGE_OUT',
  BECOME_ELIGIBLE: 'BECOME_ELIGIBLE',
} as const

export type CsaEvent = (typeof CSA_EVENT)[keyof typeof CSA_EVENT]

export const USER_CSA_EVENTS = new Set<string>([
  CSA_EVENT.ADD_TO_BATCH,
  CSA_EVENT.REMOVE_FROM_BATCH,
  CSA_EVENT.SET_NOT_ELIGIBLE,
  CSA_EVENT.SET_ELIGIBLE_TBD,
  CSA_EVENT.HOLD,
  CSA_EVENT.RESUME,
])

export const SYSTEM_CSA_EVENTS = new Set<string>([
  CSA_EVENT.SEND_TO_CRA,
  CSA_EVENT.CRA_ACCEPTED,
  CSA_EVENT.CRA_RECORD_REJECTED,
  CSA_EVENT.CRA_RECYCLED,
  CSA_EVENT.CRA_PROBLEM_DETECTED,
  CSA_EVENT.CRA_FILE_REJECTED,
  CSA_EVENT.LOSE_PAY_ELIGIBILITY,
])

// Maps preBatchStatus to target state when removing from batch.
// Keys must cover all states that can reach in_batch_application/in_batch_cancellation via ADD_TO_BATCH.
// See CSA_TRANSITIONS in csa-status.machine.ts for the full list.
export const REMOVE_FROM_BATCH_TARGET: Record<string, string> = {
  [CSA_STATUS.ELIGIBLE]: CSA_STATUS.ELIGIBLE_TBD,
  [CSA_STATUS.ELIGIBLE_TBD]: CSA_STATUS.ELIGIBLE_TBD,
  [CSA_STATUS.APPLICATION_REFUSED_CRA]: CSA_STATUS.APPLICATION_REFUSED_CRA,
  [CSA_STATUS.NOT_ELIGIBLE_IN_PAY]: CSA_STATUS.NOT_ELIGIBLE_IP_TBD,
  [CSA_STATUS.NOT_ELIGIBLE_IP_TBD]: CSA_STATUS.NOT_ELIGIBLE_IP_TBD,
  [CSA_STATUS.CANCELLATION_REFUSED_CRA]: CSA_STATUS.CANCELLATION_REFUSED_CRA,
}

// Maps preBatchStatus to target state when file is rejected by CRA.
// Keys must match REMOVE_FROM_BATCH_TARGET. Refused states revert to TBD (file rejection != CRA record-level decision).
export const CRA_FILE_REJECTED_TARGET: Record<string, string> = {
  [CSA_STATUS.ELIGIBLE]: CSA_STATUS.ELIGIBLE,
  [CSA_STATUS.ELIGIBLE_TBD]: CSA_STATUS.ELIGIBLE_TBD,
  [CSA_STATUS.APPLICATION_REFUSED_CRA]: CSA_STATUS.ELIGIBLE_TBD,
  [CSA_STATUS.NOT_ELIGIBLE_IN_PAY]: CSA_STATUS.NOT_ELIGIBLE_IN_PAY,
  [CSA_STATUS.NOT_ELIGIBLE_IP_TBD]: CSA_STATUS.NOT_ELIGIBLE_IP_TBD,
  [CSA_STATUS.CANCELLATION_REFUSED_CRA]: CSA_STATUS.NOT_ELIGIBLE_IP_TBD,
}

// State-based actor permissions
// { [state]: { [event]: allowedActors[] } }
export const STATE_ACTOR_PERMISSIONS: Record<string, Record<string, ('USER' | 'SYSTEM')[]>> = {
  [CSA_STATUS.ELIGIBLE]: {
    [CSA_EVENT.AGE_OUT]: ['SYSTEM'],
  },
  [CSA_STATUS.ELIGIBLE_TBD]: {
    [CSA_EVENT.BECOME_ELIGIBLE]: ['SYSTEM'],
    [CSA_EVENT.AGE_OUT]: ['USER'],
  },
  [CSA_STATUS.NOT_ELIGIBLE_OUT_OF_PAY]: {
    [CSA_EVENT.BECOME_ELIGIBLE]: ['SYSTEM'],
    [CSA_EVENT.AGE_OUT]: ['SYSTEM'],
  },
  [CSA_STATUS.IN_PAY]: {
    [CSA_EVENT.AGE_OUT]: ['SYSTEM'],
  },
  [CSA_STATUS.NOT_ELIGIBLE_IN_PAY]: {
    [CSA_EVENT.BECOME_ELIGIBLE]: ['SYSTEM'],
    [CSA_EVENT.AGE_OUT]: ['SYSTEM'],
  },
  [CSA_STATUS.NOT_ELIGIBLE_IP_TBD]: {
    [CSA_EVENT.BECOME_ELIGIBLE]: ['USER'],
    [CSA_EVENT.AGE_OUT]: ['USER'],
  },
}

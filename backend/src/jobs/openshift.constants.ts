/**
 * OpenShift CronJob names.
 * These must match the CronJob resources deployed by DevOps.
 */
export const OPENSHIFT_CRONJOB_NAMES = {
  RUN_ELIGIBILITY: 'csa-run-eligibility',
  AUTO_BATCH: 'csa-run-auto-batch',
  SEND_CRA_FILE: 'csa-cra-file-transfer',
} as const

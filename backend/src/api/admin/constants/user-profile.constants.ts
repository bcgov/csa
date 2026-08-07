/**
 * User profile types for CSA application access control.
 * These profiles determine what actions a user can perform.
 */
export const USER_PROFILE = {
  /** Standard CSA user - read-only access */
  CSA_STANDARD: 'CSA_STANDARD',

  /** Data Quality Steward - can update and delete contact records */
  DATA_QUALITY_STEWARD: 'DATA_QUALITY_STEWARD',
} as const

export type UserProfile = (typeof USER_PROFILE)[keyof typeof USER_PROFILE]

/**
 * ICM responsibility that grants Data Quality Steward privileges
 */
export const DATA_STEWARD_ICM_RESPONSIBILITY = 'ICM DATA STEWARD'

/**
 * ICM responsibility names that grant CSA access (read-write and read-only)
 */
export const CSA_RW_ICM_RESPONSIBILITY = 'ICM CSA APPLICATION - RW'
export const CSA_RO_ICM_RESPONSIBILITY = 'ICM CSA APPLICATION - RO'

/**
 * ICM responsibilities that grant CSA access
 */
export const CSA_ACCESS_ICM_RESPONSIBILITIES = [
  CSA_RW_ICM_RESPONSIBILITY,
  CSA_RO_ICM_RESPONSIBILITY,
]

/**
 * Validates if a user profile string is valid
 */
export function isValidUserProfile(profile: string): profile is UserProfile {
  return Object.values(USER_PROFILE).includes(profile as UserProfile)
}

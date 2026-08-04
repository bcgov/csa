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
 * ICM responsibilities that grant CSA access
 */
export const CSA_ACCESS_ICM_RESPONSIBILITIES = [
  'ICM CSA APPLICATION - RW',
  'ICM CSA APPLICATION - RO',
]

/**
 * Validates if a user profile string is valid
 */
export function isValidUserProfile(profile: string): profile is UserProfile {
  return Object.values(USER_PROFILE).includes(profile as UserProfile)
}

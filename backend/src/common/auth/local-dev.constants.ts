import {
  isValidUserProfile,
  USER_PROFILE,
  type UserProfile,
} from 'src/api/admin/constants/user-profile.constants'

export const LOCAL_DEV_TOKEN = 'local-dev-token'

export const LOCAL_DEV_PROFILE_HEADER = 'x-local-dev-profile'

export const LOCAL_DEV_USER = {
  sub: 'local-dev',
  preferred_username: 'local.dev',
  idir_username: 'LOCAL.DEV',
  email: 'local.dev@example.com',
  name: 'Local Dev User',
}

export function resolveLocalDevProfile(profileHint?: string | null): UserProfile {
  const candidate = profileHint?.trim().toUpperCase()
  if (candidate && isValidUserProfile(candidate)) {
    return candidate
  }

  const fromEnv = process.env.LOCAL_DEV_USER_PROFILE?.trim().toUpperCase()
  if (fromEnv && isValidUserProfile(fromEnv)) {
    return fromEnv
  }

  return USER_PROFILE.CSA_STANDARD
}

export function localDevIcmResponsibility(profile: UserProfile): string {
  return profile === USER_PROFILE.DATA_QUALITY_STEWARD
    ? 'ICM Data Steward'
    : 'ICM CSA Application - RW'
}

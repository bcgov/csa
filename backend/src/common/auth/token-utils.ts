import { UserInfoDto } from 'src/api/admin/dto/user-info.dto'

// Priority: idir_username > preferred_username (before @) > email (before @) > sub > 'unknown'
export function extractUsernameFromPayload(decoded: Record<string, unknown>): string {
  let username = decoded.idir_username as string
  if (!username && decoded.preferred_username) {
    username = (decoded.preferred_username as string).split('@')[0]
  }
  username =
    username || (decoded.email as string)?.split('@')[0] || (decoded.sub as string) || 'unknown'
  return username.toUpperCase()
}

export function toUserInfoDto(decoded: Record<string, unknown>, username: string): UserInfoDto {
  return {
    username,
    email: decoded.email as string | undefined,
    firstName: decoded.given_name as string | undefined,
    lastName: decoded.family_name as string | undefined,
  }
}

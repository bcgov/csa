import APIService from './api-service'

export interface UserInfo {
  username: string
  email?: string
  firstName?: string
  lastName?: string
}

export interface CSAAccessResponse {
  hasAccess: boolean
  username: string
  userInfo: UserInfo
  message: string
  userProfile?: 'DATA_QUALITY_STEWARD' | 'CSA_STANDARD'
  icmResponsibility?: string
  tokenExpired?: boolean
}

/**
 * Verify if the authenticated user has CSA access
 * Validates token, extracts username, and checks ICM for CSA Application responsibility
 * @returns CSA access verification result
 */
export const verifyCSAAccess = async (): Promise<CSAAccessResponse> => {
  console.log('Calling verifyCSAAccess API...')
  const response = await APIService.getAxiosInstance().get('/admin/verify-csa-access')
  console.log('CSA access verification API response:', response.data)
  return response.data
}

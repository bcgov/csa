export interface ICMLink {
  rel: string
  href: string
  name: string
}

export interface ICMResponsibility {
  Name: string
  Id: string
  Link: ICMLink[]
}

export interface ICMEmployee {
  Id: string
  'Party Name': string
  'Login Name': string
  Responsibility: ICMResponsibility
  Link: ICMLink[]
}

export interface ICMEmployeeResponse {
  lastpage: string
  items: ICMEmployee
  Link: ICMLink
}

export interface BCGovTokenResponse {
  access_token: string
  expires_in: number
  refresh_expires_in: number
  token_type: string
  'not-before-policy': number
  scope: string
}

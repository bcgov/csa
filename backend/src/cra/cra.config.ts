const { FTP_BASE_URL, FILE_CREATED_PATH, NODE_ENV } = process.env

const server_config = {
  FTP_BASE_URL,
  FILE_CREATED_PATH,
  NODE_ENV,
}

for (const key in server_config) {
  if (!server_config[key]) {
    console.warn(`Missing required server config env variable: ${key}`)
    // throw new Error(`Missing required server config env variable: ${key}`)
  }
}

export const SERVER_CONFIG = {
  FTP_BASE_URL: FTP_BASE_URL || 'http://localhost:4000',
  FILE_CREATED_PATH: FILE_CREATED_PATH || './temp/',
  FILE_CREATION_ENVIROMENT: NODE_ENV === 'production' ? 'PCSAIN' : 'ACSAIN',
  FILE_TYPE_APPLICATION: NODE_ENV === 'production' ? 'PAPL' : 'AAPL',
}

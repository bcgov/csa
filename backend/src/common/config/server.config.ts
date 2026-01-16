const { PORT, SERVICE_NAME, FTP_BASE_URL, FILE_CREATED_PATH, NODE_ENV } = process.env

const server_config = {
  PORT,
  SERVICE_NAME,
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
  SERVICE_NAME: process.env.SERVICE_NAME || 'csa-backend',
  FTP_BASE_URL: process.env.FTP_BASE_URL || 'http://localhost:4000/api/transfers',
  FILE_CREATED_PATH: process.env.FILE_CREATED_PATH || './temp/',
  FILE_CREATION_ENVIROMENT: process.env.NODE_ENV === 'production' ? 'PCSAIN' : 'ACSAIN',
  FILE_TYPE_APPLICATION: process.env.NODE_ENV === 'production' ? 'PAPL' : 'AAPL',
}

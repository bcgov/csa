

export const COMMON_CONSTANT ={
    APP_NAME : process.env.APP_NAME || 'csa',
    APP_VERSION : process.env.APP_VERSION || '1.0.0',
    SERVICE_NAME : process.env.SERVICE_NAME || 'csa-backend',
    FTP_BASE_URL : process.env.FTP_BASE_URL || 'http://localhost:4000/api/transfers',  
    FILE_CREATED_PATH : process.env.FILE_CREATED_PATH || './temp/',
    FILE_NAME_PREFIX: 'HT',
    FILE_CREATION_ENVIROMENT : process.env.NODE_ENV === 'production' ? 'PCSAIN' : 'ACSAIN',
    FILE_TYPE_APPLICATION: process.env.NODE_ENV === 'production' ? 'PAPL' : 'AAPL',
    FILE_TRANSACTION_CODE:{
        HEADER_TRAN_CODE: '6133',
        DETAIL_TRAN_CODE: '6134',
        TRAILER_TRAN_CODE: '6135'
    }
}
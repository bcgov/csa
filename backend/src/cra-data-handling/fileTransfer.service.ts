import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import FormData from 'form-data';
import { COMMON_CONSTANT } from 'src/common/constant/common.constant';

const { SERVICE_NAME, FTP_BASE_URL } = COMMON_CONSTANT;

@Injectable()
export class FileTransferClientService {

    async sendFileToTransferService(
        filePath: string,
        fileName: string,
        craUserId: string = 'testuser',
    ): Promise<any> {

        const formData = new FormData();

        formData.append(
            'file',
            fs.createReadStream(filePath),
            fileName
        );

        const response = await axios.post(
            FTP_BASE_URL,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    uesrid: craUserId,
                    servicename: SERVICE_NAME
                },
                timeout: 30000,
            }
        );

        return response.data;
    }
}

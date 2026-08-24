import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import HttpResponseParser from "@services/HttpResponseParser";

export type TAxiosClientConfig = {
    baseUrl: string;
    axiosConfig?: AxiosRequestConfig;
};

export default abstract class BaseHttpClient {
    protected readonly client: AxiosInstance;

    constructor(config: TAxiosClientConfig) {
        this.client = axios.create({
            baseURL: config.baseUrl,
            ...config.axiosConfig,
            transformResponse: [
                HttpResponseParser.parseWithBigIntegersAsStrings,
            ],
        });
    }

    protected async get<T>(
        url: string,
        config?: AxiosRequestConfig,
    ): Promise<T> {
        const response: AxiosResponse<T> = await this.client.get(url, config);

        return response.data;
    }

    protected async post<T>(
        url: string,
        data?: unknown,
        config?: AxiosRequestConfig,
    ): Promise<T> {
        const response: AxiosResponse<T> = await this.client.post(
            url,
            data,
            config,
        );

        return response.data;
    }
}

import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

export interface HttpClient {
    get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
    post<T = any>(
        url: string,
        data?: any,
        config?: AxiosRequestConfig,
    ): Promise<T>;
}

export default class AxiosHttpClient implements HttpClient {
    constructor(private readonly client: AxiosInstance) {}

    async get<T>(url: string): Promise<T> {
        const response: AxiosResponse<T> = await this.client.get<T>(url);
        return response.data;
    }

    async post<T>(url: string, data?: any): Promise<T> {
        const response: AxiosResponse<T> = await this.client.post<T>(url, data);
        return response.data;
    }
}

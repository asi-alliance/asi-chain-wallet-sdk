import type { AxiosInstance, AxiosResponse } from "axios";
import { IHttpClient } from "@/application/ports/outbound/IHttpClient";

export default class AxiosHttpClient implements IHttpClient {
    constructor(private readonly client: AxiosInstance) {}

    async get<T>(url: string): Promise<T> {
        const response: AxiosResponse<T> = await this.client.get<T>(url);
        return response.data;
    }

    async post<T>(url: string, data?: any): Promise<T> {
        const response: AxiosResponse<T> = await this.client.post<T>(url, data);
        return response.data;
    }

    getBaseUrl(): string | undefined {
        return this.client.defaults.baseURL;
    }
}

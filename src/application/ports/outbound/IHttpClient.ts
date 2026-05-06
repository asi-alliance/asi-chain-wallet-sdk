import type { AxiosRequestConfig } from "axios";

export interface IHttpClient {
    get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
    post<T = any>(
        url: string,
        data?: any,
        config?: AxiosRequestConfig,
    ): Promise<T>;
    getBaseUrl(): string | undefined;
}

export interface IHttpClientFactory {
    (baseUrl: string, axiosConfig?: AxiosRequestConfig): IHttpClient;
}

export interface IHttpClientConfig {
    baseUrl: string;
    axiosConfig?: AxiosRequestConfig;
}
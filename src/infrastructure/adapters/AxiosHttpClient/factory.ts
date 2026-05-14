import axios, { AxiosRequestConfig } from "axios";
import { IHttpClient, IHttpClientFactory } from "@/application/ports/outbound/IHttpClient";
import AxiosHttpClient from ".";

export const axiosHttpClientFactory: IHttpClientFactory = function (baseUrl: string, axiosConfig?: AxiosRequestConfig): IHttpClient {
    const axiosInstance = axios.create({
        baseURL: baseUrl,
        ...axiosConfig,
    });
    return new AxiosHttpClient(axiosInstance);
}
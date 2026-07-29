import axios, { AxiosInstance } from "axios";
import { TAxiosClientConfig } from "@domains/BaseHttpClient";

export default class BaseGraphQLClient {
    private readonly client: AxiosInstance;

    constructor(config: TAxiosClientConfig) {
        this.client = axios.create({
            baseURL: config.baseUrl,
            headers: {
                "Content-Type": "application/json",
            },
            ...config.axiosConfig,
        });
    }

    public async query<T>(
        query: string,
        variables?: Record<string, unknown>,
    ): Promise<T> {
        const response = await this.client.post<{
            data: T;
            errors?: unknown[];
        }>("", {
            query,
            variables,
        });

        if (response.data.errors?.length) {
            throw new Error(JSON.stringify(response.data.errors));
        }

        return response.data.data;
    }
}

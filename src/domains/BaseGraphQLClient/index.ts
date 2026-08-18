import axios, { AxiosInstance } from "axios";
import { TAxiosClientConfig } from "@domains/BaseHttpClient";
import { UnknownErrorReason } from "@domains/CustomError";
import { getErrorMessage } from "@utils/index";

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
            const reasons: string = response.data.errors
                .map((error: unknown) =>
                    getErrorMessage(error, UnknownErrorReason.GRAPHQL_API),
                )
                .join("; ");

            throw new Error(`GraphQL query failed: ${reasons}`);
        }

        return response.data.data;
    }
}

import axios, { AxiosInstance } from "axios";
import HttpResponseParser from "@services/HttpResponseParser";
import { TAxiosClientConfig } from "@domains/BaseHttpClient";
import {
    ApiRequestError,
    ApiSource,
    UnknownErrorReason,
} from "@domains/CustomError";
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
            transformResponse: [
                HttpResponseParser.parseWithBigIntegersAsStrings,
            ],
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

            throw new ApiRequestError(
                ApiSource.GRAPHQL,
                "BaseGraphQLClient.query",
                reasons,
            );
        }

        return response.data.data;
    }
}

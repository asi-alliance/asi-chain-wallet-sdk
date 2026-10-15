import { MAX_API_RESPONSE_LENGTH } from "@config/index";
import JsonTextScanner from "@services/JsonTextScanner";

const REGEX_JSON_INTEGER: RegExp = /^-?\d+$/;

export default class HttpResponseParser {
    private static quoteUnsafeInteger(token: string): string {
        if (!REGEX_JSON_INTEGER.test(token)) {
            return token;
        }

        return Number.isSafeInteger(Number(token)) ? token : `"${token}"`;
    }

    public static parseWithBigIntegersAsStrings(data: unknown): unknown {
        if (typeof data !== "string") {
            return data;
        }

        if (data.length > MAX_API_RESPONSE_LENGTH) {
            throw new Error(
                `HttpResponseParser.parseWithBigIntegersAsStrings: response of ${data.length} characters exceeds the limit of ${MAX_API_RESPONSE_LENGTH}`,
            );
        }

        try {
            return JSON.parse(
                JsonTextScanner.replaceNumbersOutsideStrings(
                    data,
                    HttpResponseParser.quoteUnsafeInteger,
                ),
            );
        } catch {
            return data;
        }
    }
}

import { MAX_API_RESPONSE_LENGTH } from "@config/index";

const REGEX_JSON_STRING_OR_NUMBER: RegExp =
    /"[^"\\]*(?:\\[\s\S][^"\\]*)*(?:"|\\?$)|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const REGEX_JSON_INTEGER: RegExp = /^-?\d+$/;

export default class HttpResponseParser {
    private static quoteUnsafeIntegers(json: string): string {
        return json.replace(REGEX_JSON_STRING_OR_NUMBER, (token: string) => {
            if (!REGEX_JSON_INTEGER.test(token)) {
                return token;
            }

            return Number.isSafeInteger(Number(token)) ? token : `"${token}"`;
        });
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
            return JSON.parse(HttpResponseParser.quoteUnsafeIntegers(data));
        } catch {
            return data;
        }
    }
}

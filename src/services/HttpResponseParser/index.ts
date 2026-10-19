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

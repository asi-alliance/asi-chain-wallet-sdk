const REGEX_JSON_STRING_OR_NUMBER: RegExp =
    /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
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

        try {
            return JSON.parse(HttpResponseParser.quoteUnsafeIntegers(data));
        } catch {
            return data;
        }
    }
}

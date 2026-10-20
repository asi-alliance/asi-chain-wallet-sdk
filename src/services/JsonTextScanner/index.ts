const REGEX_JSON_QUOTE_OR_NUMBER: RegExp =
    /"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

export type TJsonNumberReplacer = (token: string) => string;

export default class JsonTextScanner {
    private static findStringEnd(
        json: string,
        openingQuoteIndex: number,
    ): number {
        let index: number = openingQuoteIndex + 1;

        while (index < json.length) {
            if (json[index] === "\\") {
                index += 2;
                continue;
            }

            if (json[index] === '"') {
                return index + 1;
            }

            index += 1;
        }

        return json.length;
    }

    public static replaceNumbersOutsideStrings(
        json: string,
        replaceNumber: TJsonNumberReplacer,
    ): string {
        const parts: string[] = [];
        let copiedUntil: number = 0;

        REGEX_JSON_QUOTE_OR_NUMBER.lastIndex = 0;

        for (
            let match: RegExpExecArray | null =
                REGEX_JSON_QUOTE_OR_NUMBER.exec(json);
            match !== null;
            match = REGEX_JSON_QUOTE_OR_NUMBER.exec(json)
        ) {
            const token: string = match[0];

            if (token === '"') {
                REGEX_JSON_QUOTE_OR_NUMBER.lastIndex =
                    JsonTextScanner.findStringEnd(json, match.index);
                continue;
            }

            const replacement: string = replaceNumber(token);

            if (replacement === token) {
                continue;
            }

            parts.push(json.slice(copiedUntil, match.index), replacement);
            copiedUntil = REGEX_JSON_QUOTE_OR_NUMBER.lastIndex;
        }

        if (parts.length === 0) {
            return json;
        }

        parts.push(json.slice(copiedUntil));

        return parts.join("");
    }
}

import { MIN_WORDS_COUNT, MAX_WORDS_COUNT } from "../constants";

export const sanitizeWord = (raw: string): string => {
    if (!raw) {
        return "";
    }

    const withoutQuotes = raw.replace(/"/g, "");

    const lower = withoutQuotes.toLowerCase();

    const lettersOnly = lower.match(/[a-z]+/g);

    if (!lettersOnly) {
        return "";
    }

    const joined = lettersOnly.join("");

    return joined.trim();
};

export const clippedWordCount = (value: number): number => {
    if (value < MIN_WORDS_COUNT) {
        return MIN_WORDS_COUNT;
    }
    if (value > MAX_WORDS_COUNT) {
        return MAX_WORDS_COUNT;
    }

    return value;
};

export const downloadTextFile = (
    fileName: string,
    content: string,
    mimeType: string,
): void => {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    URL.revokeObjectURL(url);
};

import { wordlists } from "bip39";

import { MIN_WORDS_COUNT, MAX_WORDS_COUNT } from "../constants";

const bip39EnglishSet = new Set<string>(wordlists.english);

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

export const isBip39Word = (word: string): boolean => {
    if (!word) {
        return false;
    }

    return bip39EnglishSet.has(word);
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

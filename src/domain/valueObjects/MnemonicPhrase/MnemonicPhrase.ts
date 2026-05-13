export enum MnemonicStrength {
    TWELVE_WORDS = 128,
    TWENTY_FOUR_WORDS = 256,
}

const VALID_WORD_COUNTS = new Set([12, 24]);

export class MnemonicPhrase {
    private constructor(private readonly normalizedValue: string) {}

    public static fromString(mnemonic: string): MnemonicPhrase {
        return MnemonicPhrase.fromWords(MnemonicPhrase.toWordArray(mnemonic));
    }

    public static fromWords(words: string[]): MnemonicPhrase {
        return new MnemonicPhrase(MnemonicPhrase.wordArrayToMnemonic(words));
    }

    public static toWordArray(mnemonic: string): string[] {
        const normalized = mnemonic.trim();

        if (!normalized) {
            return [];
        }

        return normalized.split(/\s+/);
    }

    public static wordArrayToMnemonic(words: string[]): string {
        return words
            .map((word) => word.trim())
            .filter(Boolean)
            .join(" ");
    }

    public get words(): string[] {
        return MnemonicPhrase.toWordArray(this.normalizedValue);
    }

    public get wordCount(): number {
        return this.words.length;
    }

    public hasValidWordCount(): boolean {
        return VALID_WORD_COUNTS.has(this.wordCount);
    }

    public toString(): string {
        return this.normalizedValue;
    }
}

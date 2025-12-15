import * as bip39 from "bip39";

export enum MnemonicStrength {
    TWELVE_WORDS = 128,
    TWENTY_FOUR_WORDS = 256,
}

export default class MnemonicService {
    public static generateMnemonic(
        strength: MnemonicStrength = MnemonicStrength.TWELVE_WORDS
    ): string {
        return bip39.generateMnemonic(strength);
    }
    
    public static isMnemonicValid(mnemonic: string): boolean {
        return bip39.validateMnemonic(mnemonic);
    }

    public static mnemonicToWordArray(mnemonic: string): string[] {
        return mnemonic.trim().split(" ");
    }

    public static wordArrayToMnemonic(words: string[]): string {
        return words.join(" ");
    }
}

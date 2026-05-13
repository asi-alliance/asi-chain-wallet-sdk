import type { MnemonicStrength } from "@/domain/valueObjects/MnemonicPhrase";

export interface IMnemonicService {
    generateMnemonic(strength?: MnemonicStrength): string;
    isMnemonicValid(mnemonic: string): boolean;
}

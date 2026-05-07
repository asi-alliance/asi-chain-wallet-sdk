import * as bip39 from "bip39";
import type { IMnemonicService } from "../../../application/ports/outbound/IMnemonic";
import {
    MnemonicPhrase,
    MnemonicStrength,
} from "../../../domain/valueObjects/MnemonicPhrase";
import { setupBufferPolyfill } from "../../misc/polyfills";

setupBufferPolyfill();

export class Bip39MnemonicAdapter implements IMnemonicService {
    public generateMnemonic(
        strength: MnemonicStrength = MnemonicStrength.TWELVE_WORDS,
    ): string {
        return bip39.generateMnemonic(strength);
    }

    public isMnemonicValid(mnemonic: string): boolean {
        const phrase = MnemonicPhrase.fromString(mnemonic);

        return (
            phrase.hasValidWordCount() &&
            bip39.validateMnemonic(phrase.toString())
        );
    }
}

export default Bip39MnemonicAdapter;

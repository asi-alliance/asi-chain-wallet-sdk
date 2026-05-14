import type { Bip44PathOptions } from "@/domain/valueObjects/KeyDerivation";

export interface IKeyDerivation {
    derivePrivateKeyFromMnemonic(
        mnemonicWords: string[] | string,
        options?: Bip44PathOptions,
        passphrase?: string,
    ): Promise<Uint8Array>;

    deriveNextPrivateKeyFromMnemonic(
        mnemonicWords: string[] | string,
        currentIndex: number,
        options?: Omit<Bip44PathOptions, "index">,
        passphrase?: string,
    ): Promise<Uint8Array>;
}

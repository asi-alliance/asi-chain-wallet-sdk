import { WalletMeta, AddressInfo, Network, ClientMode } from "../../types";

export interface KeyManagerOptions {
    network: Network;
}

export interface KeyManager {
    mode: ClientMode;
    createWallet(options?: Partial<KeyManagerOptions>): Promise<WalletMeta>;
    createWalletFromMnemonic(
        mnemonic: string,
        options?: Partial<KeyManagerOptions>
    ): Promise<WalletMeta>;
    generateMnemonic(): Promise<string>;
    deriveAddress(params: {
        walletId: string;
        index: number;
    }): Promise<AddressInfo>;
    signTransaction(params: {
        walletId: string;
        index: number;
        rawTx: Uint8Array;
    }): Promise<Uint8Array>;
    listWallets(): Promise<WalletMeta[]>;
    deleteWallet(walletId: string): Promise<void>;
}

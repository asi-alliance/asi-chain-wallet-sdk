
export interface LocalKeyManagerOptions {
    network: "mainnet" | "testnet";
    storage?: StorageLike;
}

export interface StorageLike {
    save(key: string, value: Uint8Array): Promise<void>;
    load(key: string): Promise<Uint8Array | null>;
    remove(key: string): Promise<void>;
}

// export class LocalKeyManager implements KeyManager {
//     readonly mode: "local" = "local";
//     private readonly wallets: Map<string, WalletMeta> = new Map();
//     private readonly storage?: StorageLike;
//     private readonly network: "mainnet" | "testnet";

//     constructor(options: LocalKeyManagerOptions) {
//         this.network = options.network;
//         this.storage = options.storage;
//     }

//     async createWallet(): Promise<WalletMeta> {
//         const id = uuidv4();
//         const meta: WalletMeta = {
//             id,
//             network: this.network,
//             mode: "local",
//             label: `wallet-${id.slice(0, 6)}`,
//         };
//         this.wallets.set(id, meta);
//         return meta;
//     }

//     async createWalletFromMnemonic(_mnemonic: string): Promise<WalletMeta> {
//         throw new NotImplementedError();
//     }

//     async generateMnemonic(): Promise<string> {
//         throw new NotImplementedError();
//     }

//     async deriveAddress(params: {
//         walletId: string;
//         index: number;
//     }): Promise<AddressInfo> {
//         const meta = this.wallets.get(params.walletId);
//         if (!meta) throw new Error("wallet not found");
//         const pseudo = `${meta.id.slice(0, 6)}_${params.index}`;
//         return {
//             walletId: params.walletId,
//             index: params.index,
//             address: pseudo,
//         };
//     }

//     async signTransaction(params: {
//         walletId: string;
//         index: number;
//         rawTx: Uint8Array;
//     }): Promise<Uint8Array> {
//         throw new NotImplementedError();
//     }

//     async listWallets(): Promise<WalletMeta[]> {
//         return Array.from(this.wallets.values());
//     }

//     async deleteWallet(walletId: string): Promise<void> {
//         this.wallets.delete(walletId);
//     }
// }

import KeyManager from "../keyManager";

export interface AsiWalletClientConfig {
    keyManager: KeyManager;
    // assets?: AssetMeta[];
}

// export class AsiWalletClient {
//     private assets: Map<string, AssetMeta> = new Map();

//     constructor(private readonly config: AsiWalletClientConfig) {
//         if (config.assets) {
//             for (const a of config.assets) this.assets.set(a.id, a);
//         }
//     }


//     async getBalance(address: string, assetId: string): Promise<Balance> {
//         return this.config.rpcClient.getBalance(address, assetId);
//     }
    
//     registerAsset(a: AssetMeta) {
//         this.assets.set(a.id, a);
//     }

//     listAssets() {
//         return Array.from(this.assets.values());
//     }
// }

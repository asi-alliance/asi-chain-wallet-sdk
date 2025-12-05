import { KeyManager } from "../keyManager";
import { RpcClient } from "../rpcClient";
import {
    AssetMeta,
    Balance,
    TransferRequest,
    TransferResult,
} from "../../types";

export interface AsiWalletClientConfig {
    keyManager: KeyManager;
    rpcClient: RpcClient;
    assets?: AssetMeta[];
}

export class AsiWalletClient {
    private assets: Map<string, AssetMeta> = new Map();

    constructor(private readonly config: AsiWalletClientConfig) {
        if (config.assets) {
            for (const a of config.assets) this.assets.set(a.id, a);
        }
    }

    async createWallet() {
        return this.config.keyManager.createWallet();
    }

    async getAddress(walletId: string, index: number) {
        return this.config.keyManager.deriveAddress({ walletId, index });
    }

    async getBalance(address: string, assetId: string): Promise<Balance> {
        return this.config.rpcClient.getBalance(address, assetId);
    }

    async transfer(request: TransferRequest): Promise<TransferResult> {
        const raw = await this.config.rpcClient.buildTransferTx(request);
        const signed = await this.config.keyManager.signTransaction({
            walletId: request.fromWalletId,
            index: request.fromIndex,
            rawTx: raw,
        });
        return this.config.rpcClient.sendTransaction(signed);
    }
    
    registerAsset(a: AssetMeta) {
        this.assets.set(a.id, a);
    }

    listAssets() {
        return Array.from(this.assets.values());
    }
}

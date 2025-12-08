import { WalletClientModes } from "../../config";
import { Networks } from "../accountsManager";
import { ec as EC } from "elliptic";
export interface KeyManagerOptions {
    network: Networks;
}

export default class KeyManager {
    private mode: WalletClientModes;
    private secp256k1: EC;

    constructor(mode: WalletClientModes) {
        this.mode = mode;
        this.secp256k1 = new EC("secp256k1");
    }

    public generateKeyPair() {
        switch (this.mode) {
            case WalletClientModes.LOCAL:
                return this.generateLocalKeyPair();
            case WalletClientModes.MPC:
                return this.generateMpcKeyPair();
            default:
                throw new Error(`Unsupported key manager mode: ${this.mode}`);
        }
    }

    generateLocalKeyPair() {
        try {
            const key = this.secp256k1.genKeyPair();
            const publicKey = key.getPublic("hex");
            const privateKey = key.getPrivate("hex");
            return { publicKey, privateKey };
        } catch (error) {
            throw new Error(`Key pair generation failed: ${error}`);
        }
    }

    generateMpcKeyPair() {
        throw new Error("MPC key generation is not implemented yet.");
    }
}

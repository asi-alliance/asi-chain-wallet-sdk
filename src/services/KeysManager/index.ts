import { ec as EC } from "elliptic";

const secp256k1 = new EC("secp256k1");

export interface KeyPair {
    publicKey: string;
    privateKey: string;
}

export default class KeysService {
    public static generateKeyPair(): KeyPair {
        const keyPair: EC.KeyPair = secp256k1.genKeyPair();

        return this.extractKeys(keyPair);
    }

    public static getKeyPairFromPrivateKey(privateKey: string) {
        const keyPair: EC.KeyPair = secp256k1.keyFromPrivate(privateKey);

        return this.extractKeys(keyPair);
    }

    public static generateMpcKeyPair() {
        throw new Error("MPC key generation is not implemented yet.");
    }

    private static extractKeys(keyPair: EC.KeyPair): KeyPair {
        return {
            publicKey: keyPair.getPublic("hex"),
            privateKey: keyPair.getPrivate("hex"),
        };
    }
}

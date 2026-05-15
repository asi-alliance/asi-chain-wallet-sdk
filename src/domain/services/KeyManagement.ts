export interface KeyPair {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
}

export interface IKeyManager {
    generateRandomKey(length?: number): Uint8Array;
    generateKeyPair(keyLength?: number): KeyPair;
    getKeyPairFromPrivateKey(privateKey: Uint8Array): KeyPair;
    getPublicKeyFromPrivateKey(privateKey: Uint8Array): Uint8Array;
    convertKeyToHex(key: Uint8Array): string;
}

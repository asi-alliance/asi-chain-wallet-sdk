import KeyManager, { KeyManageClientModes } from "../keyManager";
import { keccak256 } from "js-sha3";
import { blake2bHex } from "blakejs";
import bs58 from "bs58";
import * as tinysecp from "tiny-secp256k1";

import * as bip39 from "bip39";

// Polyfill Buffer for browser environments
import { Buffer } from "buffer";
if (typeof window !== "undefined" && !(window as any).Buffer) {
    (window as any).Buffer = Buffer;
}

import * as bip32 from "bip32";

export async function generateMnemonic(strength = 128): Promise<string> {
    return bip39.generateMnemonic(strength);
}

export async function mnemonicToSeed(
    mnemonic: string,
    passphrase = ""
): Promise<Uint8Array> {
    return await bip39.mnemonicToSeed(mnemonic, passphrase);
}

export function seedToMasterNode(seed: any): bip32.BIP32Interface {
    return bip32.default(tinysecp).fromSeed(seed);
}

export function buildBip44Path(
    coinType: number,
    account = 0,
    change = 0,
    index = 0
): string {
    return `m/44'/${coinType}'/${account}'/${change}/${index}`;
}

export function derivePrivateKey(
    masterNode: bip32.BIP32Interface,
    path: string
): Uint8Array {
    const node = masterNode.derivePath(path);
    if (!node.privateKey) throw new Error("No private key at derived node");
    return node.privateKey;
}

const prefix = { coinId: "000000", version: "00" };

// 1. mnemonic = generateMnemonic()
// 2. seed = mnemonicToSeed(mnemonic)
// 3. masterNode = seedToMasterNode(seed)
// 4. path = buildBip44Path(coinType, account, change, index)
// 5. childNode = masterNode.derivePath(path)
// 6. privateKey = childNode.privateKey
// 7. publicKey = childNode.publicKey
// 8. address = deriveAddress(privateKey or publicKey)

const encodeBase58 = (hex: string): string => {
    const bytes = decodeBase16(hex);
    return bs58.encode(bytes);
};

export interface AccountManagerOptions {
    accountName: string;
    password: string;
    network: string;
    keyManagerMode?: KeyManageClientModes;
}

export interface Account {
    id: string;
    name: string;
    address: string;
    publicKey: string;
    privateKey?: string;
    createdAt: Date;
}

export enum Networks {
    DEVNET = "devnet",
    TESTNET = "testnet",
    MAINNET = "mainnet",
}

const decodeBase16 = (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
};

export class AccountManager {
    private accounts: Account[] = [];
    private keyManager: KeyManager;

    constructor(accounts?: Account[], options?: AccountManagerOptions) {
        this.accounts = accounts || [];
        this.keyManager = new KeyManager(
            options?.keyManagerMode || KeyManageClientModes.LOCAL
        );
    }

    public async createWalletFromMnemonic() {
        const mnemonic = await generateMnemonic();
        console.log("mnemonic:", mnemonic);

        const seed = await mnemonicToSeed(mnemonic);
        console.log("seed:", seed);

        const masterNode = seedToMasterNode(seed);
        console.log("masterNode:", masterNode.toBase58());

        const path = buildBip44Path(60, 0, 0, 0); // Example for Ethereum
        console.log("BIP44 Path:", path);

        const privateKey = derivePrivateKey(masterNode, path);
        console.log("Derived Private Key:", privateKey);

        const address = this.deriveAddressFromPublicKey(
            privateKey.toString()
        );

        console.log("privateKey", Buffer.from(privateKey).toString("hex"));
        console.log("Derived Address:", address);
    }

    public createWallet(options: AccountManagerOptions) {
        // todo add index
        const keyPair = this.keyManager.generateKeyPair();

        console.log("Generated Key Pair:", keyPair);

        if (!keyPair?.publicKey || !keyPair?.privateKey) {
            throw new Error("Key pair generation failed.");
        }

        const address = this.deriveAddressFromPublicKey(keyPair.publicKey);

        const account: Account = {
            id: this.generateId(address),
            name: options.accountName,
            address,
            publicKey: keyPair.publicKey,
            privateKey: keyPair.privateKey,
            createdAt: new Date(),
        };

        return account;
    }

    private deriveAddressFromPublicKey(publicKey: string): string {
        const publicKeyBytes = decodeBase16(publicKey);
        const hash = keccak256(publicKeyBytes.slice(1));
        const addressBase = hash.slice(-40);
        //
        const ethAddrBytes = decodeBase16(addressBase);
        const ethHash = keccak256(ethAddrBytes);

        const payload = `${prefix.coinId}${prefix.version}${ethHash}`;
        const payloadBytes = decodeBase16(payload);
        const checksum = blake2bHex(payloadBytes, undefined, 32).slice(0, 8);
        return encodeBase58(`${payload}${checksum}`);
    }

    private generateId(address: string): string {
        return keccak256(address);
    }
}

import KeysManager from "@services/KeysManager";
import CryptoService, { EncryptedData } from "@services/Crypto";
import { stringifyPrivateKeyToUnitArray } from "@utils/functions";
import { WalletTypes } from "@domains/WalletsStorageRepository";
import { TPasswordProvider } from "@domains/PasswordProvider";
import { SigningCapability } from "@domains/Wallet";
import { getHDWalletOptions } from "@utils/wallet";
import { sign } from "@noble/secp256k1";

export interface IDecryptSignerDataPayload {
    passwordProvider: TPasswordProvider;
    derivationPath?: string;
}

export interface IWithSigningCapabilityPayload<T> {
    passwordProvider: TPasswordProvider;
    derivationPath?: string;
    callback: (signingCapability: SigningCapability) => Promise<T> | T;
}

export default class Signer {
    private id: string;
    private type: WalletTypes;
    private encryptedSecret: EncryptedData;

    constructor(id: string, type: WalletTypes, encryptedSecret: EncryptedData) {
        this.id = id;
        this.type = type;
        this.encryptedSecret = encryptedSecret;
    }

    public getId(): string {
        return this.id;
    }

    public getType(): string {
        return this.type;
    }

    public getEncryptedSecret(): EncryptedData {
        return this.encryptedSecret;
    }

    private async decryptPrivateKey({
        passwordProvider,
        derivationPath,
    }: IDecryptSignerDataPayload): Promise<Uint8Array> {
        const { password } = await passwordProvider();

        try {
            const stringifyKeyData = await CryptoService.decryptWithPassword(
                this.encryptedSecret,
                password,
            );

            const keyData: Uint8Array =
                stringifyPrivateKeyToUnitArray(stringifyKeyData);

            if (this.type === WalletTypes.PRIVATE_KEY) {
                return keyData;
            }

            const { privateKey } = await KeysManager.getPrivateDataFromSeed(
                keyData,
                getHDWalletOptions(derivationPath!, null),
            );

            return privateKey;
        } catch (error: any) {
            throw new Error("Unlock Failed: " + error?.message);
        }
    }

    public async withSigningCapability<T>({
        passwordProvider,
        derivationPath,
        callback,
    }: IWithSigningCapabilityPayload<T>): Promise<T> {
        const privateKey = await this.decryptPrivateKey({
            passwordProvider,
            derivationPath,
        });
        let expired = false;

        const signingCapability: SigningCapability = {
            signDigest: async (digest: Uint8Array): Promise<Uint8Array> => {
                if (expired) {
                    throw new Error("Signing capability has expired");
                }

                return await sign(digest, privateKey);
            },
            getPublicKey: (): Uint8Array => {
                if (expired) {
                    throw new Error("Signing capability has expired");
                }

                return KeysManager.getPublicKeyFromPrivateKey(privateKey);
            },
        };

        try {
            return await callback(signingCapability);
        } finally {
            expired = true;
            privateKey.fill(0);
        }
    }
}

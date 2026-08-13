import {
    InvalidKeyfileError,
    InvalidKeyfilePasswordError,
} from "@domains/CustomError";
import SecretsProvider from "@domains/SecretsProvider";
import { TDecryptedSecret, WalletTypes } from "@domains/Signer";
import CryptoService, { EncryptedData } from "@services/Crypto";
import type { IWalletKeyfile } from "@services/ExportKeyfileService";
import { isPrivateKeySecretData } from "@utils/guards";
import { validateWalletKeyfile } from "@utils/validators";

export default class ImportKeyfileService {
    public static fromJSON(source: string): unknown {
        try {
            return JSON.parse(source);
        } catch {
            throw new InvalidKeyfileError("Keyfile is not a valid JSON");
        }
    }

    public static parseWalletKeyfile(source: unknown): IWalletKeyfile {
        const keyfileSource: unknown =
            typeof source === "string"
                ? ImportKeyfileService.fromJSON(source)
                : source;

        const { isValid, error } = validateWalletKeyfile(keyfileSource);

        if (!isValid) {
            throw new InvalidKeyfileError(error);
        }

        return keyfileSource as IWalletKeyfile;
    }

    public static async decryptKeyfileSecret(
        walletType: WalletTypes,
        encryptedSecret: EncryptedData,
        passwordProvider: SecretsProvider,
    ): Promise<TDecryptedSecret> {
        let secret: TDecryptedSecret;

        try {
            secret = await CryptoService.decryptSignerData(
                encryptedSecret,
                passwordProvider,
            );
        } catch {
            throw new InvalidKeyfilePasswordError();
        }

        const isPrivateKeyWalletKeyfile: boolean =
            walletType === WalletTypes.PRIVATE_KEY;

        if (isPrivateKeySecretData(secret) !== isPrivateKeyWalletKeyfile) {
            throw new InvalidKeyfileError(
                "Keyfile secret does not match its wallet type",
            );
        }

        return secret;
    }
}
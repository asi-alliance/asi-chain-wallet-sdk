import HDSigner from "@domains/Signer/HD";
import CryptoService from "@services/Crypto";
import KeyFingerprintService from "@services/KeyFingerprint";
import PrivateKeySigner from "@domains/Signer/PK";
import SecretsProvider from "@domains/SecretsProvider";
import Signer, {
    ISignerRecord,
    TDecryptedSecret,
    WalletTypes,
} from "@domains/Signer";
import { generateRandomId, isPrivateKeySecretData } from "@utils/index";

export interface ICreateImportedSignerPayload {
    secret: TDecryptedSecret;
    passwordProvider: SecretsProvider;
}

export type TCreateSignerPayload =
    | {
          id: string;
          type: WalletTypes.PRIVATE_KEY;
          secretProvider: SecretsProvider;
      }
    | {
          id: string;
          type: WalletTypes.HD;
          secretProvider: SecretsProvider;
      };

export const createSigner = async (
    payload: TCreateSignerPayload,
): Promise<Signer> => {
    const { password, secret } = payload.secretProvider.getSecret();

    const encryptedSecret = await CryptoService.encryptWithPassword(
        JSON.stringify(secret),
        password,
    );

    const encryptedDataKey = await CryptoService.encryptWithPassword(
        CryptoService.generateDataKeySecret(),
        password,
    );

    switch (payload.type) {
        case WalletTypes.PRIVATE_KEY:
            return new PrivateKeySigner({
                id: payload.id,
                encryptedSecret,
                encryptedDataKey,
                fingerprint: KeyFingerprintService.fromPrivateKey(
                    secret.privateKey,
                ),
            });

        case WalletTypes.HD: {
            return new HDSigner({
                id: payload.id,
                encryptedSecret,
                encryptedDataKey,
                fingerprint: await KeyFingerprintService.fromMnemonic(
                    secret.seed,
                ),
            });
        }
    }
};

export const createImportedSigner = ({
    secret,
    passwordProvider,
}: ICreateImportedSignerPayload): Promise<Signer> => {
    const id: string = generateRandomId();

    if (isPrivateKeySecretData(secret)) {
        return createSigner({
            id,
            type: WalletTypes.PRIVATE_KEY,
            secretProvider: new SecretsProvider(() => ({
                password: passwordProvider.getSecret().password,
                secret,
            })),
        });
    }

    return createSigner({
        id,
        type: WalletTypes.HD,
        secretProvider: new SecretsProvider(() => ({
            password: passwordProvider.getSecret().password,
            secret: {
                seed: secret.seed,
                rootHDPath: secret.rootHDPath.toString(),
            },
        })),
    });
};

export const restoreSigner = ({
    id,
    type,
    encryptedData,
    encryptedDataKey,
    fingerprint,
}: ISignerRecord): Signer => {
    switch (type) {
        case WalletTypes.PRIVATE_KEY:
            return new PrivateKeySigner({
                id,
                encryptedSecret: encryptedData,
                encryptedDataKey,
                fingerprint,
            });

        case WalletTypes.HD:
            return new HDSigner({
                id,
                encryptedSecret: encryptedData,
                encryptedDataKey,
                fingerprint,
            });
    }
};

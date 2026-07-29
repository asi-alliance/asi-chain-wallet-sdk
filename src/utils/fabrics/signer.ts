import HDSigner from "@domains/Signer/HD";
import CryptoService from "@services/Crypto";
import PrivateKeySigner from "@domains/Signer/PK";
import SecretsProvider from "@domains/SecretsProvider";
import Signer, { ISignerRecord, WalletTypes } from "@domains/Signer";

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
            });

        case WalletTypes.HD: {
            return new HDSigner({
                id: payload.id,
                encryptedSecret,
                encryptedDataKey,
            });
        }
    }
};

export const restoreSigner = ({
    id,
    type,
    encryptedData,
    encryptedDataKey,
}: ISignerRecord): Signer => {
    switch (type) {
        case WalletTypes.PRIVATE_KEY:
            return new PrivateKeySigner({
                id,
                encryptedSecret: encryptedData,
                encryptedDataKey,
            });

        case WalletTypes.HD:
            return new HDSigner({
                id,
                encryptedSecret: encryptedData,
                encryptedDataKey,
            });
    }
};

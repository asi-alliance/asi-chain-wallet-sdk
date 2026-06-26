import Signer, { ISignerRecord } from "../../domains/Signer";
import HDSigner from "../../domains/Signer/HD";
import PrivateKeySigner from "../../domains/Signer/PK";
import CryptoService from "../../services/Crypto";
import SecretsProvider from "../../domains/SecretsProvider";
import { WalletTypes } from "../../domains/Wallet";

export type TCreateSignerPayload =
    | {
          type: WalletTypes.PRIVATE_KEY;
          secretProvider: SecretsProvider;
      }
    | {
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

    switch (payload.type) {
        case WalletTypes.PRIVATE_KEY:
            return new PrivateKeySigner(encryptedSecret);

        case WalletTypes.HD: {
            return new HDSigner(encryptedSecret);
        }
    }
};

export const restoreSigner = ({
    type,
    encryptedData,
}: Omit<ISignerRecord, "id">): Signer => {
    switch (type) {
        case WalletTypes.PRIVATE_KEY:
            return new PrivateKeySigner(encryptedData);

        case WalletTypes.HD:
            return new HDSigner(encryptedData);
    }
};

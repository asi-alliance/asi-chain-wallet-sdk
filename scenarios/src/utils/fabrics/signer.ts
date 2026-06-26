import Signer, { ISignerRecord } from "../../domains/Signer";
import HDSigner from "../../domains/Signer/HD";
import PrivateKeySigner from "../../domains/Signer/PK";
import { WalletTypes } from "@domains/WalletsStorageRepository";
import CryptoService from "../../services/Crypto";
import SecretsProvider, {
    IHDSecretRecord,
    IPasswordCredentials,
    IPrivateKeyCredentials,
} from "../../domains/SecretsProvider";

export type TCreateSignerPayload =
    | {
          type: WalletTypes.PRIVATE_KEY;
          passwordProvider: SecretsProvider<IPasswordCredentials>;
          secretProvider: SecretsProvider<IPrivateKeyCredentials>;
      }
    | {
          type: WalletTypes.HD;
          passwordProvider: SecretsProvider<IPasswordCredentials>;
          secretProvider: SecretsProvider<IHDSecretRecord>;
      };

export const createSigner = async (
    payload: TCreateSignerPayload,
): Promise<Signer> => {
    const { password } = payload.passwordProvider.getSecret();

    const secret = payload.secretProvider.getSecret();

    const encryptedSecret = await CryptoService.encryptWithPassword(
        JSON.stringify(secret),
        password,
    );

    switch (payload.type) {
        case WalletTypes.PRIVATE_KEY:
            return new PrivateKeySigner(encryptedSecret);

        case WalletTypes.HD:
            return new HDSigner(encryptedSecret);
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

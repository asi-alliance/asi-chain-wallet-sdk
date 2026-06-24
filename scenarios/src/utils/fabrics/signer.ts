import Signer from "../../domains/Signer";
import CryptoService from "@services/Crypto";
import HDSigner from "../../domains/Signer/HD";
import PrivateKeySigner from "../../domains/Signer/PK";
import { WalletTypes } from "@domains/WalletsStorageRepository";
import {
    TPasswordProvider,
    THDSecretProvider,
    TPrivateKeyProvider,
} from "@domains/PasswordProvider";

export type TCreateSignerPayload =
    | {
          type: WalletTypes.PRIVATE_KEY;
          passwordProvider: TPasswordProvider;
          secretProvider: TPrivateKeyProvider;
      }
    | {
          type: WalletTypes.HD;
          passwordProvider: TPasswordProvider;
          secretProvider: THDSecretProvider;
      };

export const createSigner = async (
    payload: TCreateSignerPayload,
): Promise<Signer> => {
    const { password } = await payload.passwordProvider();

    const secret = await payload.secretProvider();

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

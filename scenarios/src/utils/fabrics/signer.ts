import {
    TPasswordProvider,
    THDSecretProvider,
    TPrivateKeyProvider,
} from "@domains/PasswordProvider";
import { WalletTypes } from "@domains/WalletsStorageRepository";
import Signer from "../../domains/Signer";
import HierarchicalDeterministicSigner from "../../domains/HierarchicalDeterministicSigner";
import CryptoService from "@services/Crypto";
import PrivateKeySigner from "../../domains/PrivateKeySigner";

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
            return new HierarchicalDeterministicSigner(encryptedSecret);
    }
};

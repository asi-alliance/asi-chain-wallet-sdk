import {
  InvalidKeyfileError,
  InvalidKeyfilePasswordError,
} from "@domains/CustomError";
import SecretsProvider from "@domains/SecretsProvider";
import { TDecryptedSecret, WalletTypes } from "@domains/Signer";
import type { IImportKeyfileWalletPayload } from "@domains/Wallet";
import type { IKeyfileWalletAccount } from "@services/KeyfileSerializer";
import CryptoService, { EncryptedData } from "@services/Crypto";
import type { IWalletKeyfile } from "@services/ExportKeyfileService";
import { isPrivateKeySecretData } from "@utils/guards";
import {
  validateWalletKeyfile,
  validateWalletKeyfileAccounts,
} from "@utils/validators";

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

  public static async decryptKeyfileAccounts(
    keyfile: IWalletKeyfile,
    passwordProvider: SecretsProvider,
  ): Promise<IKeyfileWalletAccount[]> {
    let serializedAccounts: string;

    try {
      serializedAccounts = await CryptoService.decryptWithPassword(
        keyfile.encryptedAccounts,
        passwordProvider.getSecret().password,
      );
    } catch {
      throw new InvalidKeyfilePasswordError();
    }

    const accounts: unknown = ImportKeyfileService.fromJSON(serializedAccounts);

    const { isValid, error } = validateWalletKeyfileAccounts(
      accounts,
      keyfile.walletType,
    );

    if (!isValid) {
      throw new InvalidKeyfileError(error);
    }

    return accounts as IKeyfileWalletAccount[];
  }

  public static async toImportPayload(
    keyfile: IWalletKeyfile,
    passwordProvider: SecretsProvider,
  ): Promise<IImportKeyfileWalletPayload> {
    const accounts: IKeyfileWalletAccount[] =
      await ImportKeyfileService.decryptKeyfileAccounts(
        keyfile,
        passwordProvider,
      );

    return {
      walletType: keyfile.walletType,
      encryptedSecret: keyfile.encryptedPrivateData,
      accounts: accounts.map(({ name, index }: IKeyfileWalletAccount) => ({
        name,
        index: index ?? undefined,
      })),
    };
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

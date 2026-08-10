import Bip44Path from "@domains/Bip44Path";
import { IHDSecret, IPrivateKeyCredentials } from "@domains/SecretsProvider";
import { TCreateHDPathWalletOptions } from "@domains/Wallet";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { validateNodeApiProfile } from "@utils/validators";

export const isCustomCreateHDWalletOptions = (
    options: TCreateHDPathWalletOptions,
): options is { customHDPath: Bip44Path } => {
    return "customHDPath" in options;
};

export const isPrivateKeySecretData = (
    secretData: IPrivateKeyCredentials | IHDSecret,
): secretData is IPrivateKeyCredentials => {
    return "privateKey" in secretData;
};

export const isNodeApiProfile = (value: unknown): value is NodeApiProfile => {
    return validateNodeApiProfile(value).isValid;
};

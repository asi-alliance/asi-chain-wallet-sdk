import Bip44Path from "../../domains/Bip44Path";
import {
    IHDSecret,
    IPrivateKeyCredentials,
} from "../../domains/SecretsProvider";
import { TCreateHDWalletOptions } from "../../domains/Wallet";

export const isCustomCreateHDWalletOptions = (
    options: TCreateHDWalletOptions,
): options is { customHDPath: Bip44Path } => {
    return "customHDPath" in options;
};

export const isPrivateKeySecretData = (
    secretData: IPrivateKeyCredentials | IHDSecret,
): secretData is IPrivateKeyCredentials => {
    return "privateKey" in secretData;
};

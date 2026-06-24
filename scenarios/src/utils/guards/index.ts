import { TCreateHDWalletOptions } from "@domains/Wallet";
import {
    IPasswordCredentials,
    IPrivateKeyCredentials,
} from "@domains/PasswordProvider";

export const isPrivateKeyPasswordData = (
    data: IPasswordCredentials | IPrivateKeyCredentials,
): data is IPrivateKeyCredentials => {
    return "privateKey" in data;
};

export const isCustomCreateHDWalletOptions = (
    options: TCreateHDWalletOptions,
): options is { customHDPath: string } => {
    return "customHDPath" in options;
};

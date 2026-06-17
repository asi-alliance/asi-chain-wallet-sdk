import {
    IPrivateKeyCredentials,
    IHDWalletCredentials,
} from "@domains/PasswordProvider";

export const isHDWalletPasswordData = (
    data: IHDWalletCredentials | IPrivateKeyCredentials,
): data is IHDWalletCredentials => {
    return "seedPassword" in data;
};

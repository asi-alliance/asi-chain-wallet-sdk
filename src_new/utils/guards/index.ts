import {
    IPasswordCredentials,
    IPrivateKeyCredentials,
} from "@domains/PasswordProvider";

export const isPrivateKeyPasswordData = (
    data: IPasswordCredentials | IPrivateKeyCredentials,
): data is IPrivateKeyCredentials => {
    return "privateKey" in data;
};

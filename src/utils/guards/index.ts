import Bip44Path from "@domains/Bip44Path";
import { IHDSecret, IPrivateKeyCredentials } from "@domains/SecretsProvider";
import { TCreateHDPathWalletOptions } from "@domains/Wallet";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { validateNodeApiProfile } from "@utils/validators";
import type { EncryptedData } from "@services/Crypto";
import type { IKeyfileAccount } from "@services/KeyfileSerializer";

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

export const isEncryptedData = (value: unknown): value is EncryptedData => {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const { data, salt, iv, version } = value as EncryptedData;

    return (
        typeof data === "string" &&
        typeof salt === "string" &&
        typeof iv === "string" &&
        typeof version === "number"
    );
};

export const isKeyfileAccount = (value: unknown): value is IKeyfileAccount => {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const { name, address, index } = value as IKeyfileAccount;

    return (
        typeof name === "string" &&
        typeof address === "string" &&
        (index === null || typeof index === "number")
    );
};

export const isPromiseLike = (
    value: unknown,
): value is PromiseLike<unknown> => {
    return (
        typeof value === "object" &&
        value !== null &&
        "then" in value &&
        typeof value.then === "function"
    );
};

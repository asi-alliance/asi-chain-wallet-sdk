import Bip44Path from "@domains/Bip44Path";
import { IHDSecret, IPrivateKeyCredentials } from "@domains/SecretsProvider";
import { TCreateHDPathWalletOptions } from "@domains/Wallet";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { ISerializedTransactionReservationPrivateData } from "@domains/Transaction";
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

export const isSerializedTransactionReservationPrivateData = (
    value: unknown,
): value is ISerializedTransactionReservationPrivateData => {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    if (!("kind" in value) || !("details" in value)) {
        return false;
    }

    const { details } = value;

    if (typeof details !== "object" || details === null) {
        return false;
    }

    return "deployId" in details && typeof details.deployId === "string";
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

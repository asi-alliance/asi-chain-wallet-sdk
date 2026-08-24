import Bip44Path from "@domains/Bip44Path";
import {
    IHDSecret,
    IHDSecretRecord,
    IPrivateKeyCredentials,
    TStoredSecret,
} from "@domains/SecretsProvider";
import { TCreateHDPathWalletOptions } from "@domains/Wallet";
import type { ISerializedTransactionReservationPrivateData } from "@domains/Transaction";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { validateNodeApiProfile } from "@utils/validators";
import type { EncryptedData } from "@services/Crypto";
import type {
    IKeyfileAccount,
    IKeyfileWalletAccount,
} from "@services/KeyfileSerializer";

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

export const isStoredSecret = (value: unknown): value is TStoredSecret => {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    if ("privateKey" in value) {
        return (
            typeof value.privateKey === "object" && value.privateKey !== null
        );
    }

    const { seed, rootHDPath } = value as IHDSecretRecord;

    return typeof seed === "string" && typeof rootHDPath === "string";
};

export const isSerializedReservationPrivateData = (
    value: unknown,
): value is ISerializedTransactionReservationPrivateData => {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const { accountId, pendingAmount, expirationTime, transaction } =
        value as ISerializedTransactionReservationPrivateData;

    return (
        typeof accountId === "string" &&
        typeof pendingAmount === "string" &&
        typeof expirationTime === "number" &&
        typeof transaction === "object" &&
        transaction !== null &&
        typeof transaction.id === "string" &&
        typeof transaction.timestamp === "string"
    );
};

export const isRecordWithMessage = (
    value: unknown,
): value is { message: string } => {
    return (
        typeof value === "object" &&
        value !== null &&
        "message" in value &&
        typeof value.message === "string" &&
        value.message.trim().length > 0
    );
};

export const isErrorWithMessage = (value: unknown): value is Error => {
    return isRecordWithMessage(value) && value instanceof Error;
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

export const isKeyfileWalletAccount = (
    value: unknown,
): value is IKeyfileWalletAccount => {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const { name, index } = value as IKeyfileWalletAccount;

    return (
        typeof name === "string" &&
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

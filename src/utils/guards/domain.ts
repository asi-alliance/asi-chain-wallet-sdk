import Bip44Path from "@domains/Bip44Path";
import {
    IHDSecret,
    IPrivateKeyCredentials,
    TStoredSecret,
} from "@domains/SecretsProvider";
import { TCreateHDPathWalletOptions } from "@domains/Wallet";
import {
    ISerializedTransactionReservationPrivateData,
    TRANSACTION_DETECTED_BY_TYPES,
    TRANSACTION_STATUSES,
    TRANSACTION_TYPES,
    TSerializedTransaction,
} from "@domains/Transaction";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import MnemonicService from "@services/Mnemonic";
import { toUint8Array } from "@utils/codec";
import { isPrivateKeyValid, validateNodeApiProfile } from "@utils/validators";
import {
    isAtomicAmount,
    isRecord,
    isSerializedAmount,
    isValueInConst,
} from "./primitives";
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

const isStoredPrivateKey = (value: unknown): boolean => {
    try {
        return isPrivateKeyValid(toUint8Array(value));
    } catch {
        return false;
    }
};

export const isStoredSecret = (value: unknown): value is TStoredSecret => {
    if (!isRecord(value)) {
        return false;
    }

    if ("privateKey" in value) {
        return isStoredPrivateKey(value.privateKey);
    }

    const { seed, rootHDPath } = value;

    return (
        typeof seed === "string" &&
        MnemonicService.isMnemonicValid(seed) &&
        typeof rootHDPath === "string" &&
        Bip44Path.isValid(rootHDPath)
    );
};

const isSerializedTransaction = (
    value: unknown,
): value is TSerializedTransaction => {
    if (!isRecord(value)) {
        return false;
    }

    if (
        typeof value.id !== "string" ||
        typeof value.timestamp !== "string" ||
        Number.isNaN(Date.parse(value.timestamp)) ||
        !isValueInConst(value.type, TRANSACTION_TYPES) ||
        !isValueInConst(value.status, TRANSACTION_STATUSES) ||
        typeof value.from !== "string" ||
        typeof value.networkId !== "string"
    ) {
        return false;
    }

    if ("amount" in value && !isSerializedAmount(value.amount)) {
        return false;
    }

    if ("to" in value && typeof value.to !== "string") {
        return false;
    }

    if ("deployId" in value && typeof value.deployId !== "string") {
        return false;
    }

    if ("blockHash" in value && typeof value.blockHash !== "string") {
        return false;
    }

    if ("gasCost" in value && !isSerializedAmount(value.gasCost)) {
        return false;
    }

    if ("contractCode" in value && typeof value.contractCode !== "string") {
        return false;
    }

    if (
        "detectedBy" in value &&
        !isValueInConst(value.detectedBy, TRANSACTION_DETECTED_BY_TYPES)
    ) {
        return false;
    }

    return true;
};

export const isSerializedReservationPrivateData = (
    value: unknown,
): value is ISerializedTransactionReservationPrivateData => {
    if (!isRecord(value)) {
        return false;
    }

    const { accountId, pendingAmount, expirationTime, transaction } = value;

    return (
        typeof accountId === "string" &&
        isAtomicAmount(pendingAmount) &&
        typeof expirationTime === "number" &&
        Number.isFinite(expirationTime) &&
        isSerializedTransaction(transaction)
    );
};

export const isEncryptedData = (value: unknown): value is EncryptedData => {
    if (!isRecord(value)) {
        return false;
    }

    const { data, salt, iv, version } = value;

    return (
        typeof data === "string" &&
        typeof salt === "string" &&
        typeof iv === "string" &&
        typeof version === "number"
    );
};

export const isKeyfileAccount = (value: unknown): value is IKeyfileAccount => {
    if (!isRecord(value)) {
        return false;
    }

    const { name, address, index } = value;

    return (
        typeof name === "string" &&
        typeof address === "string" &&
        (index === null || typeof index === "number")
    );
};

export const isKeyfileWalletAccount = (
    value: unknown,
): value is IKeyfileWalletAccount => {
    if (!isRecord(value)) {
        return false;
    }

    const { name, index } = value;

    return (
        typeof name === "string" &&
        (index === null || typeof index === "number")
    );
};
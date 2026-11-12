import Bip44Path from "@domains/Bip44Path";
import {
    IHDSecret,
    IPrivateKeyCredentials,
    TStoredSecret,
} from "@domains/SecretsProvider";
import { TCreateHDPathWalletOptions } from "@domains/Wallet";
import {
    ISerializedTransactionReservationPrivateData,
    TRANSACTION_RESERVATION_KINDS,
    TSerializedTransactionReservationDetails,
} from "@domains/Transaction";
import type { NetworkId } from "@domains/Network";
import { NODE_API_PROFILES, NodeApiProfile } from "@domains/NodeApiProfile";
import MnemonicService from "@services/Mnemonic";
import { toUint8Array } from "@utils/codec";
import { CANONICAL_INTEGER_REGEX, MAX_UINT256 } from "@utils/constants";
import {
    isIntegerInRange,
    isPrivateKeyValid,
} from "@utils/validators/primitives";
import {
    isRecord,
    isSerializedDecimal,
    isSerializedInteger,
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
    return isValueInConst(value, NODE_API_PROFILES);
};

export const isUint256 = (
    value: unknown,
): value is number | string | bigint => {
    if (typeof value === "number") {
        return isIntegerInRange(value, 0, Number.MAX_SAFE_INTEGER);
    }

    if (typeof value === "string") {
        return (
            CANONICAL_INTEGER_REGEX.test(value) && BigInt(value) <= MAX_UINT256
        );
    }

    return typeof value === "bigint" && value >= 0n && value <= MAX_UINT256;
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

const isSerializedReservationDetails = (
    value: unknown,
): value is TSerializedTransactionReservationDetails => {
    if (!isRecord(value)) {
        return false;
    }

    if (
        typeof value.deployId !== "string" ||
        typeof value.timestamp !== "string" ||
        Number.isNaN(Date.parse(value.timestamp)) ||
        typeof value.from !== "string"
    ) {
        return false;
    }

    if ("to" in value && typeof value.to !== "string") {
        return false;
    }

    if ("amount" in value && !isSerializedDecimal(value.amount)) {
        return false;
    }

    if ("gasCost" in value && !isSerializedDecimal(value.gasCost)) {
        return false;
    }

    if ("contractCode" in value && typeof value.contractCode !== "string") {
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

    const { accountId, pendingAmount, expirationTime, kind, details } = value;

    return (
        typeof accountId === "string" &&
        isSerializedInteger(pendingAmount) &&
        typeof expirationTime === "number" &&
        Number.isFinite(expirationTime) &&
        isValueInConst(kind, TRANSACTION_RESERVATION_KINDS) &&
        isSerializedReservationDetails(details)
    );
};

export const isRestorableReservationData = (
    value: unknown,
    networkId: NetworkId,
    knownNetworkIds: Set<NetworkId>,
): value is ISerializedTransactionReservationPrivateData => {
    if (!isSerializedReservationPrivateData(value)) {
        return false;
    }

    if (value.expirationTime <= Date.now()) {
        return false;
    }

    return knownNetworkIds.has(networkId);
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

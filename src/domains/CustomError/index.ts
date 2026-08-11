import { NetworkId } from "@domains/Network";

export enum CustomErrorCode {
    WALLET_LOCKED = "WALLET_LOCKED",
    NETWORK_BUSY = "NETWORK_BUSY",
    STORAGE_VERSION_DOWNGRADE = "STORAGE_VERSION_DOWNGRADE",
}

export class CustomError extends Error {
    public readonly code: CustomErrorCode;
    public readonly status: number;

    constructor(code: CustomErrorCode, message: string, status: number) {
        super(message);

        this.name = new.target.name;
        this.code = code;
        this.status = status;
    }
}

export class WalletLockedError extends CustomError {
    constructor(
        message: string = "Wallet signing session is locked or expired, re-authentication is required",
    ) {
        super(CustomErrorCode.WALLET_LOCKED, message, 403);
    }
}

export class NetworkBusyError extends CustomError {
    public readonly networkId: NetworkId;

    constructor(
        networkId: NetworkId,
        message: string = `Network ${networkId} has an operation in progress and cannot be switched, updated or removed`,
    ) {
        super(CustomErrorCode.NETWORK_BUSY, message, 409);

        this.networkId = networkId;
    }
}

export class StorageVersionDowngradeError extends CustomError {
    public readonly storedVersion: number;
    public readonly supportedVersion: number;

    constructor(
        storedVersion: number,
        supportedVersion: number,
        message: string = `Persisted storage uses schema version ${storedVersion}, while this SDK build supports version ${supportedVersion}. Storage was left untouched, update the SDK to read this data`,
    ) {
        super(CustomErrorCode.STORAGE_VERSION_DOWNGRADE, message, 409);

        this.storedVersion = storedVersion;
        this.supportedVersion = supportedVersion;
    }
}
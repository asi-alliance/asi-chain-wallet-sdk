import { NetworkId } from "@domains/Network";

export enum CustomErrorCode {
    WALLET_LOCKED = "WALLET_LOCKED",
    NETWORK_BUSY = "NETWORK_BUSY",
    DUPLICATE_WALLET = "DUPLICATE_WALLET",
    DUPLICATE_ACCOUNT = "DUPLICATE_ACCOUNT",
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

export class DuplicateWalletError extends CustomError {
    public readonly existingSignerId: string;

    constructor(
        existingSignerId: string,
        message: string = `This secret is already imported as the wallet ${existingSignerId}`,
    ) {
        super(CustomErrorCode.DUPLICATE_WALLET, message, 409);

        this.existingSignerId = existingSignerId;
    }
}

export class DuplicateAccountError extends CustomError {
    public readonly existingSignerId: string;
    public readonly existingAccountId: string;

    constructor(
        existingSignerId: string,
        existingAccountId: string,
        message: string = `This key already belongs to the account ${existingAccountId} of the wallet ${existingSignerId}`,
    ) {
        super(CustomErrorCode.DUPLICATE_ACCOUNT, message, 409);

        this.existingSignerId = existingSignerId;
        this.existingAccountId = existingAccountId;
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
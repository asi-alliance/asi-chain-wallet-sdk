import { NetworkId } from "@domains/Network";
import type { Address } from "@domains/Wallet";

export enum CustomErrorCode {
    WALLET_LOCKED = "WALLET_LOCKED",
    NETWORK_BUSY = "NETWORK_BUSY",
    BALANCE_UNAVAILABLE = "BALANCE_UNAVAILABLE",
    DUPLICATE_WALLET = "DUPLICATE_WALLET",
    DUPLICATE_ACCOUNT = "DUPLICATE_ACCOUNT",
    WALLET_ACTION_IN_PROGRESS = "WALLET_ACTION_IN_PROGRESS",
    WALLET_OPERATION_CANCELLED = "WALLET_OPERATION_CANCELLED",
    DOMAIN_CLOSED = "DOMAIN_CLOSED",
    INVALID_PASSWORD = "INVALID_PASSWORD",
}

export enum WalletAction {
    OPEN = "OPEN",
    DERIVE_ACCOUNT = "DERIVE_ACCOUNT",
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

export class WalletOperationCancelledError extends CustomError {
    public readonly signerId: string;

    constructor(
        signerId: string,
        message: string = `Wallet ${signerId} operation was cancelled because the wallet was locked or closed while the operation was in progress`,
    ) {
        super(CustomErrorCode.WALLET_OPERATION_CANCELLED, message, 409);

        this.signerId = signerId;
    }
}

export class InvalidPasswordError extends CustomError {
    public readonly details: string | null;

    constructor(details: string | null = null) {
        super(
            CustomErrorCode.INVALID_PASSWORD,
            details ? `Password not valid: ${details}` : "Password not valid",
            403,
        );

        this.details = details;
    }
}

export class DomainClosedError extends CustomError {
    public readonly domainName: string;

    constructor(
        domainName: string,
        message: string = `${domainName} is closed and cannot be used, create a new instance instead`,
    ) {
        super(CustomErrorCode.DOMAIN_CLOSED, message, 410);

        this.domainName = domainName;
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

export class WalletActionInProgressError extends CustomError {
    public readonly action: WalletAction;
    public readonly signerId: string;

    constructor(
        action: WalletAction,
        signerId: string,
        message: string = `Wallet ${signerId} already has the ${action} action in progress`,
    ) {
        super(CustomErrorCode.WALLET_ACTION_IN_PROGRESS, message, 409);

        this.action = action;
        this.signerId = signerId;
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

export class BalanceUnavailableError extends CustomError {
    public readonly address: Address;
    public readonly reason: string;

    constructor(address: Address, reason: string) {
        super(
            CustomErrorCode.BALANCE_UNAVAILABLE,
            `Balance of ${address} could not be read: ${reason}`,
            502,
        );

        this.address = address;
        this.reason = reason;
    }
}

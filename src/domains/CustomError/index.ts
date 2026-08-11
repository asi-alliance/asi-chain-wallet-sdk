import { NetworkId } from "@domains/Network";
import type { Address } from "@domains/Wallet";

export enum CustomErrorCode {
    WALLET_LOCKED = "WALLET_LOCKED",
    NETWORK_BUSY = "NETWORK_BUSY",
    BALANCE_UNAVAILABLE = "BALANCE_UNAVAILABLE",
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
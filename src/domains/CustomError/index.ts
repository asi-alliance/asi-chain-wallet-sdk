export enum CustomErrorCode {
    WALLET_LOCKED = "WALLET_LOCKED",
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
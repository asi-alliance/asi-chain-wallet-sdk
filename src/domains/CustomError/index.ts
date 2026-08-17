import { NetworkId } from "@domains/Network";
import type { Address } from "@domains/Wallet";

export enum CustomErrorCode {
    WALLET_LOCKED = "WALLET_LOCKED",
    NETWORK_BUSY = "NETWORK_BUSY",
    STORAGE_VERSION_DOWNGRADE = "STORAGE_VERSION_DOWNGRADE",
    STORAGE_MIGRATION_INTERRUPTED = "STORAGE_MIGRATION_INTERRUPTED",
    STORAGE_MIGRATION_ROLLBACK_FAILED = "STORAGE_MIGRATION_ROLLBACK_FAILED",
    STORAGE_MIGRATION_CHAIN_INVALID = "STORAGE_MIGRATION_CHAIN_INVALID",
    BALANCE_UNAVAILABLE = "BALANCE_UNAVAILABLE",
    DUPLICATE_WALLET = "DUPLICATE_WALLET",
    DUPLICATE_ACCOUNT = "DUPLICATE_ACCOUNT",
    WALLET_ACTION_IN_PROGRESS = "WALLET_ACTION_IN_PROGRESS",
    WALLET_OPERATION_CANCELLED = "WALLET_OPERATION_CANCELLED",
    DOMAIN_CLOSED = "DOMAIN_CLOSED",
}

export enum WalletAction {
    OPEN = "OPEN",
    DERIVE_ACCOUNT = "DERIVE_ACCOUNT",
}

export enum StorageMigrationChainViolation {
    DUPLICATE_VERSION = "DUPLICATE_VERSION",
    VERSION_OUT_OF_RANGE = "VERSION_OUT_OF_RANGE",
    MISSING_MIGRATION = "MISSING_MIGRATION",
}

export enum StorageMigrationInterruptionReason {
    ROLLBACK_FAILED = "ROLLBACK_FAILED",
    MIGRATION_NOT_RESUMABLE = "MIGRATION_NOT_RESUMABLE",
    MIGRATION_NOT_FOUND = "MIGRATION_NOT_FOUND",
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

export class StorageMigrationChainError extends CustomError {
    public readonly violation: StorageMigrationChainViolation;
    public readonly versions: number[];

    constructor(
        violation: StorageMigrationChainViolation,
        versions: number[],
        message: string = `Storage migration chain is invalid (${violation}) for schema versions ${versions.join(", ")}`,
    ) {
        super(CustomErrorCode.STORAGE_MIGRATION_CHAIN_INVALID, message, 500);

        this.violation = violation;
        this.versions = versions;
    }
}

export class StorageMigrationInterruptedError extends CustomError {
    public readonly pendingVersion: number;
    public readonly reason: StorageMigrationInterruptionReason;

    constructor(
        pendingVersion: number,
        reason: StorageMigrationInterruptionReason,
        message: string = `Migration to storage schema version ${pendingVersion} did not finish (${reason}). Storage state is unknown and cannot be migrated automatically`,
    ) {
        super(CustomErrorCode.STORAGE_MIGRATION_INTERRUPTED, message, 409);

        this.pendingVersion = pendingVersion;
        this.reason = reason;
    }
}

export class StorageMigrationRollbackError extends CustomError {
    public readonly failedVersion: number;
    public readonly failures: string[];
    public readonly migrationError: unknown;

    constructor(
        failedVersion: number,
        failures: string[],
        migrationError: unknown,
        message: string = `Migration to storage schema version ${failedVersion} failed and its rollback did not complete (${failures.join("; ")}). Storage holds partially migrated data and must be restored from an export or re-imported`,
    ) {
        super(CustomErrorCode.STORAGE_MIGRATION_ROLLBACK_FAILED, message, 500);

        this.failedVersion = failedVersion;
        this.failures = failures;
        this.migrationError = migrationError;
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

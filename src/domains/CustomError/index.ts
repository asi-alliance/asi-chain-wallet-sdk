import { NetworkId } from "@domains/Network";
import type { Address } from "@domains/Wallet";

export enum CustomErrorCode {
    WALLET_LOCKED = "WALLET_LOCKED",
    NETWORK_BUSY = "NETWORK_BUSY",
    STORAGE_VERSION_DOWNGRADE = "STORAGE_VERSION_DOWNGRADE",
    STORAGE_MIGRATION_FAILED = "STORAGE_MIGRATION_FAILED",
    STORAGE_MIGRATION_INTERRUPTED = "STORAGE_MIGRATION_INTERRUPTED",
    STORAGE_MIGRATION_ROLLBACK_FAILED = "STORAGE_MIGRATION_ROLLBACK_FAILED",
    STORAGE_MIGRATION_CHAIN_INVALID = "STORAGE_MIGRATION_CHAIN_INVALID",
    BALANCE_UNAVAILABLE = "BALANCE_UNAVAILABLE",
    DUPLICATE_WALLET = "DUPLICATE_WALLET",
    DUPLICATE_ACCOUNT = "DUPLICATE_ACCOUNT",
    WALLET_ACTION_IN_PROGRESS = "WALLET_ACTION_IN_PROGRESS",
    INVALID_KEYFILE = "INVALID_KEYFILE",
    INVALID_KEYFILE_PASSWORD = "INVALID_KEYFILE_PASSWORD",
    KEYFILE_WALLET_NOT_FOUND = "KEYFILE_WALLET_NOT_FOUND",
    WALLET_OPERATION_CANCELLED = "WALLET_OPERATION_CANCELLED",
    DOMAIN_CLOSED = "DOMAIN_CLOSED",
    INVALID_PASSWORD = "INVALID_PASSWORD",
    CORRUPTED_DATA = "CORRUPTED_DATA",
    UNSUPPORTED_ENCRYPTION_VERSION = "UNSUPPORTED_ENCRYPTION_VERSION",
    KEY_DERIVATION_FAILED = "KEY_DERIVATION_FAILED",
    STORAGE_OPERATION_FAILED = "STORAGE_OPERATION_FAILED",
    API_REQUEST_FAILED = "API_REQUEST_FAILED",
    DEPLOY_TIMEOUT = "DEPLOY_TIMEOUT",
    HD_WALLET_ONLY_OPERATION = "HD_WALLET_ONLY_OPERATION",
    LAST_ACCOUNT_REMOVAL = "LAST_ACCOUNT_REMOVAL",
}

export enum WalletAction {
    OPEN = "OPEN",
    DERIVE_ACCOUNT = "DERIVE_ACCOUNT",
    SAVE_ACCOUNTS = "SAVE_ACCOUNTS",
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

export enum UnknownErrorReason {
    STORAGE = "browser storage did not report a reason",
    STORAGE_MIGRATION = "the storage migration did not report a reason",
    NODE_API = "node api did not report a reason",
    GRAPHQL_API = "graphql api did not report a reason",
    CRYPTO = "the crypto engine did not report a reason",
}

export enum CorruptedDataSource {
    ENCRYPTED_SALT = "the salt of the encrypted payload",
    ENCRYPTED_IV = "the initialization vector of the encrypted payload",
    ENCRYPTED_CONTENT = "the content of the encrypted payload",
    WALLET_SECRET = "the decrypted wallet secret",
    RESERVATION_DATA = "the decrypted transaction reservation",
}

export enum StorageOperation {
    OPEN_DATABASE = "open the database",
    CREATE_TABLE = "create the table",
    DROP_TABLE = "drop the table",
    RUN_TRANSACTION = "run a transaction on the table",
    FINISH_TRANSACTION = "finish an aborted transaction on the table",
}

export enum ApiSource {
    NODE = "node api",
    GRAPHQL = "graphql api",
}

export interface IErrorContext {
    context: string;
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

export class CorruptedDataError extends CustomError {
    public readonly source: CorruptedDataSource;

    constructor(
        source: CorruptedDataSource,
        message: string = `Cannot read ${source}, the data is corrupted`,
    ) {
        super(CustomErrorCode.CORRUPTED_DATA, message, 422);

        this.source = source;
    }
}

export class UnsupportedEncryptionVersionError extends CustomError {
    public readonly version: number;
    public readonly supportedVersion: number;

    constructor(
        version: number,
        supportedVersion: number,
        message: string = `Unsupported version ${version} of the encrypted payload, this SDK build supports version ${supportedVersion}`,
    ) {
        super(CustomErrorCode.UNSUPPORTED_ENCRYPTION_VERSION, message, 400);

        this.version = version;
        this.supportedVersion = supportedVersion;
    }
}

export class KeyDerivationError extends CustomError {
    public readonly reason: string;

    constructor(reason: string) {
        super(
            CustomErrorCode.KEY_DERIVATION_FAILED,
            `Encryption key could not be derived from the password: ${reason}`,
            500,
        );

        this.reason = reason;
    }
}

export class StorageOperationError extends CustomError {
    public readonly operation: StorageOperation;
    public readonly target: string;
    public readonly reason: string;

    constructor(operation: StorageOperation, target: string, reason: string) {
        super(
            CustomErrorCode.STORAGE_OPERATION_FAILED,
            `Storage failed to ${operation} '${target}': ${reason}`,
            500,
        );

        this.operation = operation;
        this.target = target;
        this.reason = reason;
    }
}

export class ApiRequestError extends CustomError {
    public readonly source: ApiSource;
    public readonly operation: string;
    public readonly reason: string;

    constructor(source: ApiSource, operation: string, reason: string) {
        super(
            CustomErrorCode.API_REQUEST_FAILED,
            `Request to the ${source} failed during ${operation}: ${reason}`,
            502,
        );

        this.source = source;
        this.operation = operation;
        this.reason = reason;
    }
}

export class DeployTimeoutError extends CustomError {
    public readonly deployId: string;
    public readonly timeoutMs: number;

    constructor(
        deployId: string,
        timeoutMs: number,
        message: string = `Deploy ${deployId} was not finalized within ${timeoutMs} ms, it may still be processed by the network`,
    ) {
        super(CustomErrorCode.DEPLOY_TIMEOUT, message, 408);

        this.deployId = deployId;
        this.timeoutMs = timeoutMs;
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

export class HDWalletOnlyOperationError extends CustomError {
    public readonly operation: string;

    constructor(
        operation: string,
        message: string = `Operation ${operation} is available only for HD wallets`,
    ) {
        super(CustomErrorCode.HD_WALLET_ONLY_OPERATION, message, 403);

        this.operation = operation;
    }
}

export class LastAccountRemovalError extends CustomError {
    public readonly walletId: string;
    public readonly accountId: string;

    constructor(
        walletId: string,
        accountId: string,
        message: string = `Account ${accountId} is the last account of the wallet ${walletId} and cannot be removed`,
    ) {
        super(CustomErrorCode.LAST_ACCOUNT_REMOVAL, message, 409);

        this.walletId = walletId;
        this.accountId = accountId;
    }
}

export class InvalidKeyfileError extends CustomError {
    constructor(
        message: string = "Keyfile is malformed or has an unsupported version",
    ) {
        super(CustomErrorCode.INVALID_KEYFILE, message, 400);
    }
}

export class InvalidKeyfilePasswordError extends CustomError {
    constructor(
        message: string = "Keyfile cannot be decrypted with the provided password",
    ) {
        super(CustomErrorCode.INVALID_KEYFILE_PASSWORD, message, 401);
    }
}

export class KeyfileWalletNotFoundError extends CustomError {
    constructor(
        message: string = "Keyfile secret does not belong to any stored wallet, its accounts have no wallet to be imported into",
    ) {
        super(CustomErrorCode.KEYFILE_WALLET_NOT_FOUND, message, 404);
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

export class StorageSchemaError extends CustomError {
    public readonly isStorageIntact: boolean;

    constructor(
        code: CustomErrorCode,
        message: string,
        status: number,
        isStorageIntact: boolean,
    ) {
        super(code, message, status);

        this.isStorageIntact = isStorageIntact;
    }
}

export class StorageVersionDowngradeError extends StorageSchemaError {
    public readonly storedVersion: number;
    public readonly supportedVersion: number;

    constructor(
        storedVersion: number,
        supportedVersion: number,
        message: string = `Persisted storage uses schema version ${storedVersion}, while this SDK build supports version ${supportedVersion}. Storage was left untouched, update the SDK to read this data`,
    ) {
        super(CustomErrorCode.STORAGE_VERSION_DOWNGRADE, message, 409, true);

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

export class StorageMigrationFailedError extends StorageSchemaError {
    public readonly failedVersion: number;
    public readonly description: string;
    public readonly storedVersion: number;
    public readonly migrationError: unknown;

    constructor(
        failedVersion: number,
        description: string,
        storedVersion: number,
        migrationError: unknown,
        message: string = `Migration to storage schema version ${failedVersion} (${description}) failed and was rolled back. Storage is intact on schema version ${storedVersion} and can be read by the previous SDK build`,
    ) {
        super(CustomErrorCode.STORAGE_MIGRATION_FAILED, message, 500, true);

        this.failedVersion = failedVersion;
        this.description = description;
        this.storedVersion = storedVersion;
        this.migrationError = migrationError;
    }
}

export class StorageMigrationInterruptedError extends StorageSchemaError {
    public readonly pendingVersion: number;
    public readonly reason: StorageMigrationInterruptionReason;

    constructor(
        pendingVersion: number,
        reason: StorageMigrationInterruptionReason,
        message: string = `Migration to storage schema version ${pendingVersion} did not finish (${reason}). Storage state is unknown and cannot be migrated automatically`,
    ) {
        super(
            CustomErrorCode.STORAGE_MIGRATION_INTERRUPTED,
            message,
            409,
            false,
        );

        this.pendingVersion = pendingVersion;
        this.reason = reason;
    }
}

export class StorageMigrationRollbackError extends StorageSchemaError {
    public readonly failedVersion: number;
    public readonly failures: string[];
    public readonly migrationError: unknown;

    constructor(
        failedVersion: number,
        failures: string[],
        migrationError: unknown,
        message: string = `Migration to storage schema version ${failedVersion} failed and its rollback did not complete (${failures.join("; ")}). Storage holds partially migrated data and must be restored from an export or re-imported`,
    ) {
        super(
            CustomErrorCode.STORAGE_MIGRATION_ROLLBACK_FAILED,
            message,
            500,
            false,
        );

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

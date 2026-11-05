import {
    BASELINE_STORAGE_VERSION,
    CURRENT_STORAGE_VERSION,
    PERSISTED_STORAGE_DUMP_TYPE,
    PERSISTED_STORAGE_DUMP_VERSION,
} from "@config/index";
import { PersistedStorageImportRejection } from "@domains/CustomError";
import Bip44Path from "@domains/Bip44Path";
import { WalletTypes } from "@domains/Signer";
import type { INetworkConfig, INetworkRecord } from "@domains/Network";
import {
    isEncryptedData,
    isFiniteNumber,
    isNodeApiProfile,
    isNonEmptyString,
    isRecord,
    isValueInConst,
} from "@utils/guards";
import { isIntegerInRange } from "./primitives";
import {
    isAddress,
    validateNetworkConfigUrls,
    validateNetworkUniqueness,
} from "./domain";

export interface IPersistedStorageTableNames {
    signers: string;
    accounts: string;
    transactionReservations: string;
    customNetworks: string;
    insensitiveCache: string;
}

export type TPersistedStorageDumpValidation =
    | { isValid: true }
    | {
          isValid: false;
          error: string;
          rejection: PersistedStorageImportRejection;
      };

type TPersistedStorageDumpRejection = Extract<
    TPersistedStorageDumpValidation,
    { isValid: false }
>;

type TDumpRecord = Record<string, unknown> & { id: string };

type TDumpTablesReading =
    | { isValid: true; tables: Map<string, TDumpRecord[]> }
    | TPersistedStorageDumpRejection;

type TDumpTableReading =
    | { isValid: true; records: TDumpRecord[] }
    | TPersistedStorageDumpRejection;

type TDumpSignersReading =
    | { isValid: true; walletTypes: Map<string, WalletTypes> }
    | TPersistedStorageDumpRejection;

const WALLET_TYPES: WalletTypes[] = Object.values(WalletTypes);
const HEX_STRING_REGEX: RegExp = /^(?:[0-9a-fA-F]{2})+$/;

const VALID_DUMP: TPersistedStorageDumpValidation = { isValid: true };

const rejectDump = (
    rejection: PersistedStorageImportRejection,
    error: string,
): TPersistedStorageDumpRejection => ({ isValid: false, error, rejection });

const rejectDumpRecord = (
    tableName: string,
    id: string,
    problem: string,
): TPersistedStorageDumpRejection =>
    rejectDump(
        PersistedStorageImportRejection.INVALID_FORMAT,
        `Table ${tableName} record ${id} ${problem}`,
    );

const validateDumpEnvelope = (
    source: Record<string, unknown>,
): TPersistedStorageDumpValidation => {
    if (
        source.type !== PERSISTED_STORAGE_DUMP_TYPE ||
        source.version !== PERSISTED_STORAGE_DUMP_VERSION
    ) {
        return rejectDump(
            PersistedStorageImportRejection.UNKNOWN_ENVELOPE,
            `Dump type ${source.type} of version ${source.version} is not supported`,
        );
    }

    if (
        typeof source.createdAt !== "string" ||
        Number.isNaN(Date.parse(source.createdAt))
    ) {
        return rejectDump(
            PersistedStorageImportRejection.INVALID_FORMAT,
            "Dump has no valid creation date",
        );
    }

    if (
        typeof source.schemaVersion !== "number" ||
        !isIntegerInRange(
            source.schemaVersion,
            BASELINE_STORAGE_VERSION,
            Number.MAX_SAFE_INTEGER,
        )
    ) {
        return rejectDump(
            PersistedStorageImportRejection.INVALID_FORMAT,
            "Dump has no valid storage schema version",
        );
    }

    if (source.schemaVersion > CURRENT_STORAGE_VERSION) {
        return rejectDump(
            PersistedStorageImportRejection.NEWER_SCHEMA,
            `Dump uses storage schema version ${source.schemaVersion}, while this SDK build supports version ${CURRENT_STORAGE_VERSION}`,
        );
    }

    if (isRecord(source.interruptedMigration)) {
        return rejectDump(
            PersistedStorageImportRejection.INTERRUPTED_MIGRATION,
            `Dump was taken while the migration to storage schema version ${source.interruptedMigration.pendingVersion} was unfinished, so its data cannot be migrated automatically`,
        );
    }

    if (source.interruptedMigration !== null) {
        return rejectDump(
            PersistedStorageImportRejection.INVALID_FORMAT,
            "Dump has no valid migration state",
        );
    }

    return VALID_DUMP;
};

const readDumpTable = (
    tableName: string,
    records: unknown,
): TDumpTableReading => {
    if (!Array.isArray(records)) {
        return rejectDump(
            PersistedStorageImportRejection.INVALID_FORMAT,
            `Table ${tableName} is not a list of records`,
        );
    }

    const tableRecords: TDumpRecord[] = [];
    const ids: Set<string> = new Set();

    for (const record of records) {
        if (!isRecord(record) || !isNonEmptyString(record.id)) {
            return rejectDump(
                PersistedStorageImportRejection.INVALID_FORMAT,
                `Table ${tableName} contains a record without an id`,
            );
        }

        if (ids.has(record.id)) {
            return rejectDumpRecord(tableName, record.id, "is duplicated");
        }

        if (!isFiniteNumber(record.createdAt)) {
            return rejectDumpRecord(
                tableName,
                record.id,
                "has no valid creation time",
            );
        }

        if (
            record.updatedAt !== undefined &&
            !isFiniteNumber(record.updatedAt)
        ) {
            return rejectDumpRecord(
                tableName,
                record.id,
                "has an invalid update time",
            );
        }

        ids.add(record.id);
        tableRecords.push({ ...record, id: record.id });
    }

    return { isValid: true, records: tableRecords };
};

const readDumpTables = (
    source: unknown,
    knownTables: string[],
): TDumpTablesReading => {
    if (!isRecord(source) || Array.isArray(source)) {
        return rejectDump(
            PersistedStorageImportRejection.INVALID_FORMAT,
            "Dump has no tables",
        );
    }

    const tables: Map<string, TDumpRecord[]> = new Map();

    for (const [tableName, records] of Object.entries(source)) {
        if (!knownTables.includes(tableName)) {
            return rejectDump(
                PersistedStorageImportRejection.UNKNOWN_TABLE,
                `Table ${tableName} is not known to this SDK build`,
            );
        }

        const tableReading: TDumpTableReading = readDumpTable(
            tableName,
            records,
        );

        if (!tableReading.isValid) {
            return tableReading;
        }

        tables.set(tableName, tableReading.records);
    }

    return { isValid: true, tables };
};

const readDumpSigners = (
    tableName: string,
    signers: TDumpRecord[],
): TDumpSignersReading => {
    const walletTypes: Map<string, WalletTypes> = new Map();
    const fingerprints: Set<string> = new Set();

    for (const signer of signers) {
        if (!isValueInConst(signer.type, WALLET_TYPES)) {
            return rejectDumpRecord(
                tableName,
                signer.id,
                "has an unknown wallet type",
            );
        }

        if (!isEncryptedData(signer.encryptedData)) {
            return rejectDumpRecord(
                tableName,
                signer.id,
                "has no encrypted secret",
            );
        }

        if (!isEncryptedData(signer.encryptedDataKey)) {
            return rejectDumpRecord(
                tableName,
                signer.id,
                "has no encrypted data key",
            );
        }

        if (!isNonEmptyString(signer.fingerprint)) {
            return rejectDumpRecord(
                tableName,
                signer.id,
                "has no key fingerprint",
            );
        }

        if (fingerprints.has(signer.fingerprint)) {
            return rejectDumpRecord(
                tableName,
                signer.id,
                "duplicates the key fingerprint of another wallet",
            );
        }

        fingerprints.add(signer.fingerprint);
        walletTypes.set(signer.id, signer.type);
    }

    return { isValid: true, walletTypes };
};

const validateDumpAccountIndex = (
    tableName: string,
    account: TDumpRecord,
    walletType: WalletTypes,
): TPersistedStorageDumpValidation => {
    if (walletType === WalletTypes.PRIVATE_KEY && account.index !== null) {
        return rejectDumpRecord(
            tableName,
            account.id,
            "belongs to a private key wallet and must have no index",
        );
    }

    if (
        walletType === WalletTypes.HD &&
        (typeof account.index !== "number" ||
            !isIntegerInRange(account.index, 0, Bip44Path.MAX_COMPONENT_VALUE))
    ) {
        return rejectDumpRecord(
            tableName,
            account.id,
            `belongs to an HD wallet and must have an index between 0 and ${Bip44Path.MAX_COMPONENT_VALUE}`,
        );
    }

    return VALID_DUMP;
};

const validateDumpAccountsPerWallet = (
    tableName: string,
    walletTypes: Map<string, WalletTypes>,
    accountsCount: Map<string, number>,
): TPersistedStorageDumpValidation => {
    for (const [signerId, walletType] of walletTypes) {
        const count: number = accountsCount.get(signerId) ?? 0;

        if (!count) {
            return rejectDump(
                PersistedStorageImportRejection.INVALID_FORMAT,
                `Table ${tableName} has no accounts for wallet ${signerId}`,
            );
        }

        if (walletType === WalletTypes.PRIVATE_KEY && count > 1) {
            return rejectDump(
                PersistedStorageImportRejection.INVALID_FORMAT,
                `Table ${tableName} has more than one account for private key wallet ${signerId}`,
            );
        }
    }

    return VALID_DUMP;
};

const validateDumpAccounts = (
    tableName: string,
    accounts: TDumpRecord[],
    walletTypes: Map<string, WalletTypes>,
): TPersistedStorageDumpValidation => {
    const fingerprints: Set<string> = new Set();
    const walletIndexes: Set<string> = new Set();
    const accountsCount: Map<string, number> = new Map();

    for (const account of accounts) {
        const walletType: WalletTypes | undefined =
            typeof account.signerId === "string"
                ? walletTypes.get(account.signerId)
                : undefined;

        if (typeof account.signerId !== "string" || !walletType) {
            return rejectDumpRecord(
                tableName,
                account.id,
                "references a wallet that is not in the dump",
            );
        }

        if (typeof account.name !== "string") {
            return rejectDumpRecord(tableName, account.id, "has no name");
        }

        if (!isNonEmptyString(account.fingerprint)) {
            return rejectDumpRecord(
                tableName,
                account.id,
                "has no key fingerprint",
            );
        }

        if (fingerprints.has(account.fingerprint)) {
            return rejectDumpRecord(
                tableName,
                account.id,
                "duplicates the key fingerprint of another account",
            );
        }

        const indexValidation: TPersistedStorageDumpValidation =
            validateDumpAccountIndex(tableName, account, walletType);

        if (!indexValidation.isValid) {
            return indexValidation;
        }

        const walletIndex: string = `${account.signerId}:${account.index}`;

        if (walletType === WalletTypes.HD && walletIndexes.has(walletIndex)) {
            return rejectDumpRecord(
                tableName,
                account.id,
                "duplicates the derivation index of another account in its wallet",
            );
        }

        fingerprints.add(account.fingerprint);
        walletIndexes.add(walletIndex);
        accountsCount.set(
            account.signerId,
            (accountsCount.get(account.signerId) ?? 0) + 1,
        );
    }

    return validateDumpAccountsPerWallet(tableName, walletTypes, accountsCount);
};

const validateDumpTransactionReservations = (
    tableName: string,
    reservations: TDumpRecord[],
    walletTypes: Map<string, WalletTypes>,
): TPersistedStorageDumpValidation => {
    for (const reservation of reservations) {
        if (
            typeof reservation.signerId !== "string" ||
            !walletTypes.has(reservation.signerId)
        ) {
            return rejectDumpRecord(
                tableName,
                reservation.id,
                "references a wallet that is not in the dump",
            );
        }

        if (!isNonEmptyString(reservation.networkId)) {
            return rejectDumpRecord(
                tableName,
                reservation.id,
                "has no network",
            );
        }

        if (!isEncryptedData(reservation.encryptedData)) {
            return rejectDumpRecord(
                tableName,
                reservation.id,
                "has no encrypted reservation data",
            );
        }
    }

    return VALID_DUMP;
};

const readDumpNetworkConfig = (config: unknown): INetworkConfig | null => {
    if (!isRecord(config)) {
        return null;
    }

    const { ValidatorURL, ReadOnlyURL, IndexerURL, nodeApiProfile } = config;

    if (
        typeof ValidatorURL !== "string" ||
        typeof ReadOnlyURL !== "string" ||
        typeof IndexerURL !== "string" ||
        !isNodeApiProfile(nodeApiProfile)
    ) {
        return null;
    }

    return { ValidatorURL, ReadOnlyURL, IndexerURL, nodeApiProfile };
};

const validateDumpCustomNetworks = (
    tableName: string,
    networks: TDumpRecord[],
): TPersistedStorageDumpValidation => {
    const networkRecords: INetworkRecord[] = [];

    for (const network of networks) {
        if (!isNonEmptyString(network.name)) {
            return rejectDumpRecord(tableName, network.id, "has no name");
        }

        const config: INetworkConfig | null = readDumpNetworkConfig(
            network.config,
        );

        if (!config) {
            return rejectDumpRecord(
                tableName,
                network.id,
                "has no valid network config",
            );
        }

        const urlsValidation: { isValid: boolean; error?: string } =
            validateNetworkConfigUrls(config, { allowEmpty: false });

        if (!urlsValidation.isValid) {
            return rejectDumpRecord(
                tableName,
                network.id,
                `has an invalid network config: ${urlsValidation.error}`,
            );
        }

        const uniqueness: { isValid: boolean; error?: string } =
            validateNetworkUniqueness(network.name, config, networkRecords);

        if (!uniqueness.isValid) {
            return rejectDumpRecord(
                tableName,
                network.id,
                `conflicts with another network: ${uniqueness.error}`,
            );
        }

        networkRecords.push({
            id: network.id,
            name: network.name,
            config,
            isDefault: false,
        });
    }

    return VALID_DUMP;
};

const validateDumpInsensitiveCache = (
    tableName: string,
    records: TDumpRecord[],
): TPersistedStorageDumpValidation => {
    for (const record of records) {
        if (typeof record.address !== "string" || !isAddress(record.address)) {
            return rejectDumpRecord(
                tableName,
                record.id,
                "has no valid address",
            );
        }

        if (
            typeof record.publicKey !== "string" ||
            !HEX_STRING_REGEX.test(record.publicKey)
        ) {
            return rejectDumpRecord(
                tableName,
                record.id,
                "has no valid public key",
            );
        }
    }

    return VALID_DUMP;
};

const validateDumpTablesContent = (
    tables: Map<string, TDumpRecord[]>,
    tableNames: IPersistedStorageTableNames,
): TPersistedStorageDumpValidation => {
    const signersReading: TDumpSignersReading = readDumpSigners(
        tableNames.signers,
        tables.get(tableNames.signers) ?? [],
    );

    if (!signersReading.isValid) {
        return signersReading;
    }

    const validations: (() => TPersistedStorageDumpValidation)[] = [
        () =>
            validateDumpAccounts(
                tableNames.accounts,
                tables.get(tableNames.accounts) ?? [],
                signersReading.walletTypes,
            ),
        () =>
            validateDumpTransactionReservations(
                tableNames.transactionReservations,
                tables.get(tableNames.transactionReservations) ?? [],
                signersReading.walletTypes,
            ),
        () =>
            validateDumpCustomNetworks(
                tableNames.customNetworks,
                tables.get(tableNames.customNetworks) ?? [],
            ),
        () =>
            validateDumpInsensitiveCache(
                tableNames.insensitiveCache,
                tables.get(tableNames.insensitiveCache) ?? [],
            ),
    ];

    for (const validate of validations) {
        const validation: TPersistedStorageDumpValidation = validate();

        if (!validation.isValid) {
            return validation;
        }
    }

    return VALID_DUMP;
};

export const validatePersistedStorageDump = (
    source: unknown,
    tableNames: IPersistedStorageTableNames,
): TPersistedStorageDumpValidation => {
    if (!isRecord(source)) {
        return rejectDump(
            PersistedStorageImportRejection.INVALID_FORMAT,
            "Dump is not an object",
        );
    }

    const envelopeValidation: TPersistedStorageDumpValidation =
        validateDumpEnvelope(source);

    if (!envelopeValidation.isValid) {
        return envelopeValidation;
    }

    const tablesReading: TDumpTablesReading = readDumpTables(
        source.tables,
        Object.values(tableNames),
    );

    if (!tablesReading.isValid) {
        return tablesReading;
    }

    return validateDumpTablesContent(tablesReading.tables, tableNames);
};

import { useState, type ChangeEvent, type ReactElement } from "react";
import "./style.css";
import {
    ExportKeyfileService,
    ExportPersistedStorageService,
    ImportPersistedStorageService,
    PersistedStorageImportRejectedError,
    PersistedStorageImportRejection,
    SecretsProvider,
    type IPersistedStorageDump,
    type TPersistedStorageTables,
} from "asi-wallet-sdk";
import { toErrorText, useSdkContext } from "../../sdk-react-kit";
import { useAppContext } from "@components/Application/context";
import { downloadTextFile } from "@utils/functions";

interface ISelectedDump {
    name: string;
    content: string;
}

interface IDumpPreview {
    dump: IPersistedStorageDump;
    tables: TPersistedStorageTables;
}

const stringify = (value: unknown): string => JSON.stringify(value, null, 2);

const createPasswordProvider = (password: string): SecretsProvider =>
    new SecretsProvider(() => ({ password }));

const toDumpFileName = (createdAt: string): string =>
    `asi-wallet-storage-dump-${createdAt.replace(/[:.]/g, "-")}.json`;

const toDumpHeader = ({
    type,
    version,
    schemaVersion,
    interruptedMigration,
    createdAt,
}: IPersistedStorageDump) => ({
    type,
    version,
    schemaVersion,
    interruptedMigration,
    createdAt,
});

const toRecordCounts = (
    tables: TPersistedStorageTables,
): Record<string, number> =>
    Object.fromEntries(
        Object.entries(tables).map(([tableName, records]) => [
            tableName,
            records.length,
        ]),
    );

const isStorageNotEmptyError = (error: unknown): boolean =>
    error instanceof PersistedStorageImportRejectedError &&
    error.rejection === PersistedStorageImportRejection.STORAGE_NOT_EMPTY;

const toBackupPasswordError = (
    password: string,
    confirmation: string,
): string | null => {
    if (!password.trim()) {
        return "Backup password is required";
    }

    if (password !== confirmation) {
        return "Passwords do not match";
    }

    return null;
};

const StoragePage = (): ReactElement => {
    const { initError, isReady, clearPersistence } = useSdkContext();
    const { withLoader } = useAppContext();

    const [backupPassword, setBackupPassword] = useState<string>("");
    const [backupPasswordConfirmation, setBackupPasswordConfirmation] =
        useState<string>("");
    const [isExporting, setIsExporting] = useState<boolean>(false);
    const [exportedDump, setExportedDump] =
        useState<IPersistedStorageDump | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);

    const [selectedDump, setSelectedDump] = useState<ISelectedDump | null>(
        null,
    );
    const [importPassword, setImportPassword] = useState<string>("");
    const [isImporting, setIsImporting] = useState<boolean>(false);
    const [preview, setPreview] = useState<IDumpPreview | null>(null);
    const [isImported, setIsImported] = useState<boolean>(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [isStorageNotEmpty, setIsStorageNotEmpty] = useState<boolean>(false);
    const [isStorageCleared, setIsStorageCleared] = useState<boolean>(false);

    const backupPasswordError: string | null = toBackupPasswordError(
        backupPassword,
        backupPasswordConfirmation,
    );

    const resetImportResult = (): void => {
        setPreview(null);
        setIsImported(false);
        setImportError(null);
        setIsStorageNotEmpty(false);
        setIsStorageCleared(false);
    };

    const handleExport = async (): Promise<void> => {
        setIsExporting(true);
        setExportError(null);
        setExportedDump(null);

        try {
            const dump: IPersistedStorageDump =
                await ExportPersistedStorageService.exportPersistedStorage(
                    createPasswordProvider(backupPassword),
                );

            downloadTextFile(
                toDumpFileName(dump.createdAt),
                ExportKeyfileService.toJSON(dump),
                "application/json",
            );

            setExportedDump(dump);
        } catch (error) {
            console.error(error);

            setExportError(toErrorText(error, "Storage export failed"));
        } finally {
            setIsExporting(false);
        }
    };

    const handleDumpChange = async (
        event: ChangeEvent<HTMLInputElement>,
    ): Promise<void> => {
        const file: File | undefined = event.target.files?.[0];

        resetImportResult();
        setSelectedDump(null);

        if (!file) {
            return;
        }

        try {
            setSelectedDump({ name: file.name, content: await file.text() });
        } catch (error) {
            console.error(error);

            setImportError(toErrorText(error, "Dump file cannot be read"));
        }
    };

    const handlePreview = async (): Promise<void> => {
        if (!selectedDump) {
            return;
        }

        setIsImporting(true);
        resetImportResult();

        try {
            const dump: IPersistedStorageDump =
                ImportPersistedStorageService.parsePersistedStorageDump(
                    selectedDump.content,
                );

            const tables: TPersistedStorageTables =
                await ImportPersistedStorageService.decryptPersistedStorageTables(
                    dump,
                    createPasswordProvider(importPassword),
                );

            setPreview({ dump, tables });
        } catch (error) {
            console.error(error);

            setImportError(toErrorText(error, "Dump preview failed"));
        } finally {
            setIsImporting(false);
        }
    };

    const handleImport = async (): Promise<void> => {
        if (!selectedDump) {
            return;
        }

        setIsImporting(true);
        resetImportResult();

        try {
            await withLoader(() =>
                ImportPersistedStorageService.importPersistedStorage(
                    selectedDump.content,
                    createPasswordProvider(importPassword),
                ),
            );

            setIsImported(true);
        } catch (error) {
            console.error(error);

            if (isStorageNotEmptyError(error)) {
                setIsStorageNotEmpty(true);

                return;
            }

            setImportError(toErrorText(error, "Storage import failed"));
        } finally {
            setIsImporting(false);
        }
    };

    const handleClearStorage = async (): Promise<void> => {
        if (
            !window.confirm(
                "Clear the whole SDK storage? Every stored wallet will be deleted, export the storage first if you need it.",
            )
        ) {
            return;
        }

        try {
            await withLoader(() => clearPersistence());

            setIsStorageNotEmpty(false);
            setIsStorageCleared(true);
        } catch (error) {
            console.error(error);

            setImportError(toErrorText(error, "Storage cannot be cleared"));
        }
    };

    const isImportReady: boolean =
        Boolean(selectedDump) && Boolean(importPassword) && !isImporting;

    return (
        <main className="storage-page">
            <section className="storage-page__panel">
                <div className="storage-page__header">
                    <h2 className="storage-page__title">Persisted storage</h2>
                </div>

                <div className="storage-page__scope">
                    <p>
                        A backup of the whole SDK storage: every wallet with its
                        accounts, custom networks, reservations and the cache.
                        Both calls take only the storage options and never
                        create a <code>Client</code>, so the storage can be
                        taken out even when the client refuses to start.
                    </p>
                    <p>
                        The tables are encrypted with a separate backup
                        password. Wallet secrets inside stay encrypted with
                        their own wallet passwords, so the dump does not reveal
                        account names, indexes or addresses either.
                    </p>
                </div>

                {initError !== null && (
                    <p className="storage-page__notice">
                        The client failed to start:{" "}
                        {toErrorText(initError, "unknown reason")}. The export
                        below reads the storage directly and still works.
                    </p>
                )}
            </section>

            <section className="storage-page__panel">
                <h3 className="storage-page__subtitle">Export storage</h3>

                <p className="storage-page__hint">
                    <code>ExportPersistedStorageService.exportPersistedStorage</code>{" "}
                    reads every table without running migrations and
                    downloads the dump as a JSON file. Only the header stays
                    readable, so a dump of a newer schema can be refused before
                    the password is asked.
                </p>

                <div className="storage-page__controls">
                    <div className="storage-page__field">
                        <label htmlFor="backup-password">Backup password:</label>
                        <input
                            id="backup-password"
                            type="password"
                            autoComplete="new-password"
                            value={backupPassword}
                            onChange={(event) =>
                                setBackupPassword(event.target.value)
                            }
                            disabled={isExporting}
                        />
                    </div>

                    <div className="storage-page__field">
                        <label htmlFor="backup-password-confirmation">
                            Repeat password:
                        </label>
                        <input
                            id="backup-password-confirmation"
                            type="password"
                            autoComplete="new-password"
                            value={backupPasswordConfirmation}
                            onChange={(event) =>
                                setBackupPasswordConfirmation(
                                    event.target.value,
                                )
                            }
                            disabled={isExporting}
                        />
                    </div>
                </div>

                {backupPasswordConfirmation && backupPasswordError && (
                    <div className="storage-page__error">
                        {backupPasswordError}
                    </div>
                )}

                <div className="storage-page__actions">
                    <button
                        type="button"
                        className="storage-page__action"
                        onClick={() => void handleExport()}
                        disabled={isExporting || backupPasswordError !== null}
                    >
                        Export storage
                    </button>
                </div>

                {exportError && (
                    <div className="storage-page__error">{exportError}</div>
                )}

                {exportedDump && (
                    <div className="storage-page__result">
                        <h4>Downloaded dump header</h4>
                        <pre>{stringify(toDumpHeader(exportedDump))}</pre>
                    </div>
                )}
            </section>

            <section className="storage-page__panel">
                <h3 className="storage-page__subtitle">Import storage</h3>

                <p className="storage-page__hint">
                    <code>ImportPersistedStorageService.importPersistedStorage</code>{" "}
                    writes a dump only into an empty storage and never merges
                    it into existing wallets. A rejected import of a non-empty
                    storage offers to clear it. Preview decrypts and validates
                    the dump without writing anything.
                </p>

                <div className="storage-page__controls">
                    <div className="storage-page__field">
                        <label htmlFor="dump-file">Dump file:</label>
                        <input
                            id="dump-file"
                            className="storage-page__file"
                            type="file"
                            accept="application/json,.json"
                            onChange={(event) => void handleDumpChange(event)}
                            disabled={isImporting}
                        />
                    </div>

                    <div className="storage-page__field">
                        <label htmlFor="import-backup-password">
                            Backup password:
                        </label>
                        <input
                            id="import-backup-password"
                            type="password"
                            autoComplete="current-password"
                            value={importPassword}
                            onChange={(event) =>
                                setImportPassword(event.target.value)
                            }
                            disabled={isImporting}
                        />
                    </div>
                </div>

                <div className="storage-page__actions">
                    <button
                        type="button"
                        className="storage-page__action storage-page__action--ghost"
                        onClick={() => void handlePreview()}
                        disabled={!isImportReady}
                    >
                        Preview
                    </button>
                    <button
                        type="button"
                        className="storage-page__action"
                        onClick={() => void handleImport()}
                        disabled={!isImportReady}
                    >
                        Import storage
                    </button>
                </div>

                {importError && (
                    <div className="storage-page__error">{importError}</div>
                )}

                {isStorageNotEmpty && (
                    <div className="storage-page__error">
                        The storage already holds data, and a dump is imported
                        only into an empty storage. Export the current storage
                        first if you need it, then clear the storage and run
                        the import again.
                        {!isReady &&
                            " The client failed to start, so the storage cannot be cleared from here."}
                        <div className="storage-page__actions">
                            <button
                                type="button"
                                className="storage-page__action storage-page__action--danger"
                                onClick={() => void handleClearStorage()}
                                disabled={!isReady}
                            >
                                Clear storage
                            </button>
                        </div>
                    </div>
                )}

                {isStorageCleared && (
                    <div className="storage-page__success">
                        The storage was cleared. Run the import again.
                    </div>
                )}

                {isImported && (
                    <div className="storage-page__success">
                        The dump was imported. Reload the playground so the
                        client starts on the imported storage and applies its
                        pending migrations.
                        <div className="storage-page__actions">
                            <button
                                type="button"
                                className="storage-page__action"
                                onClick={() => window.location.reload()}
                            >
                                Reload playground
                            </button>
                        </div>
                    </div>
                )}

                {preview && (
                    <div className="storage-page__result">
                        <h4>Dump header</h4>
                        <pre>{stringify(toDumpHeader(preview.dump))}</pre>
                        <h4>Records per table</h4>
                        <pre>{stringify(toRecordCounts(preview.tables))}</pre>
                    </div>
                )}
            </section>
        </main>
    );
};

export default StoragePage;

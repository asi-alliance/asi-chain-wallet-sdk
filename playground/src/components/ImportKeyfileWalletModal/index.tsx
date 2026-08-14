import {
    KeyfileImportAccountStatus,
    WalletTypes,
    type IKeyfileImportAccountPreview,
    type IKeyfileImportPreview,
} from "asi-wallet-sdk";
import {
    useState,
    type ChangeEvent,
    type FormEvent,
    type ReactElement,
} from "react";
import "./style.css";

export interface IKeyfileImportPayload {
    keyfile: string;
    password: string;
    accountIndexes?: number[];
}

export interface IImportKeyfileWalletModalProps {
    title?: string;
    onPreview: (
        keyfile: string,
        password: string,
    ) => Promise<IKeyfileImportPreview>;
    onSubmit: (payload: IKeyfileImportPayload) => void;
    onClose?: () => void;
}

interface ISelectedKeyfile {
    name: string;
    content: string;
    walletType: WalletTypes;
}

const WALLET_TYPE_LABEL: Record<WalletTypes, string> = {
    [WalletTypes.PRIVATE_KEY]: "Private Key",
    [WalletTypes.HD]: "Mnemonic",
};

const readKeyfileWalletType = (content: string): WalletTypes | null => {
    let parsed: unknown;

    try {
        parsed = JSON.parse(content);
    } catch {
        return null;
    }

    if (typeof parsed !== "object" || parsed === null) {
        return null;
    }

    const walletType = (parsed as { walletType?: WalletTypes }).walletType;

    if (!walletType || !(walletType in WALLET_TYPE_LABEL)) {
        return null;
    }

    return walletType;
};

const getSelectableIndexes = (preview: IKeyfileImportPreview): number[] =>
    preview.accounts
        .filter(
            (account: IKeyfileImportAccountPreview) =>
                account.status === KeyfileImportAccountStatus.NEW,
        )
        .map((account: IKeyfileImportAccountPreview) => account.index)
        .filter((index: number | null): index is number => index !== null);

const ImportKeyfileWalletModal = ({
    title,
    onPreview,
    onSubmit,
    onClose,
}: IImportKeyfileWalletModalProps): ReactElement => {
    const [selectedKeyfile, setSelectedKeyfile] =
        useState<ISelectedKeyfile | null>(null);
    const [password, setPassword] = useState("");
    const [preview, setPreview] = useState<IKeyfileImportPreview | null>(null);
    const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const passwordLabel = selectedKeyfile
        ? `Password of the ${WALLET_TYPE_LABEL[selectedKeyfile.walletType]} wallet`
        : "Wallet password";

    const handleKeyfileChange = async (
        event: ChangeEvent<HTMLInputElement>,
    ) => {
        const file = event.target.files?.[0];

        setLocalError(null);
        setSelectedKeyfile(null);
        setPreview(null);
        setSelectedIndexes([]);

        if (!file) {
            return;
        }

        let content: string;

        try {
            content = await file.text();
        } catch {
            setLocalError("Keyfile cannot be read.");
            return;
        }

        const walletType = readKeyfileWalletType(content);

        if (!walletType) {
            setLocalError("Selected file is not an ASI wallet keyfile.");
            return;
        }

        setSelectedKeyfile({ name: file.name, content, walletType });
    };

    const handlePreviewSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLocalError(null);

        if (!selectedKeyfile) {
            setLocalError("Please select a keyfile first.");
            return;
        }

        const formData = new FormData(event.currentTarget);
        const enteredPassword = (formData.get("password") as string) ?? "";

        setIsPreviewLoading(true);

        try {
            const keyfilePreview = await onPreview(
                selectedKeyfile.content,
                enteredPassword,
            );

            setPassword(enteredPassword);
            setPreview(keyfilePreview);
            setSelectedIndexes(getSelectableIndexes(keyfilePreview));
        } catch (error) {
            setLocalError(
                (error as Error)?.message ?? "Keyfile cannot be read.",
            );
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const toggleAccount = (index: number) => {
        setLocalError(null);
        setSelectedIndexes((currentIndexes: number[]) =>
            currentIndexes.includes(index)
                ? currentIndexes.filter(
                      (selectedIndex: number) => selectedIndex !== index,
                  )
                : [...currentIndexes, index],
        );
    };

    const handleImportSubmit = () => {
        if (!selectedKeyfile || !preview) {
            return;
        }

        if (preview.walletType !== WalletTypes.HD) {
            onSubmit({ keyfile: selectedKeyfile.content, password });
            return;
        }

        if (!selectedIndexes.length) {
            setLocalError("Please select at least one account to import.");
            return;
        }

        onSubmit({
            keyfile: selectedKeyfile.content,
            password,
            accountIndexes: selectedIndexes,
        });
    };

    const backToKeyfileStep = () => {
        setLocalError(null);
        setPreview(null);
        setSelectedIndexes([]);
    };

    return (
        <div className="wallet-create-modal__overlay">
            <div className="wallet-create-modal__content">
                <div className="wallet-create-modal__header">
                    <h2 className="wallet-create-modal__title">
                        {title ?? "Import wallet from keyfile"}
                    </h2>
                    <button
                        className="wallet-create-modal__close"
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                {!preview ? (
                    <form
                        className="wallet-create-modal__form"
                        onSubmit={handlePreviewSubmit}
                    >
                        <div className="wallet-create-modal__row">
                            <label htmlFor="keyfile">Keyfile</label>
                            <input
                                className="import-keyfile-wallet-modal__file"
                                id="keyfile"
                                name="keyfile"
                                type="file"
                                accept="application/json,.json"
                                onChange={handleKeyfileChange}
                            />
                            <span className="wallet-create-modal__hint">
                                {selectedKeyfile
                                    ? `Loaded: ${selectedKeyfile.name} · ${WALLET_TYPE_LABEL[selectedKeyfile.walletType]} wallet`
                                    : "Not provided"}
                            </span>
                        </div>

                        <div className="wallet-create-modal__row">
                            <label htmlFor="password">{passwordLabel}</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="off"
                                required
                            />
                        </div>

                        {localError && (
                            <div className="wallet-create-modal__error">
                                {localError}
                            </div>
                        )}

                        <div className="wallet-create-modal__actions">
                            <button
                                className="wallet-create-modal__button"
                                type="submit"
                                disabled={isPreviewLoading}
                            >
                                {isPreviewLoading ? "Reading..." : "Continue"}
                            </button>
                            <button
                                className="wallet-create-modal__button wallet-create-modal__button--secondary"
                                type="button"
                                onClick={onClose}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="wallet-create-modal__form">
                        {preview.existingSignerId && (
                            <div className="import-keyfile-wallet-modal__notice">
                                This keyfile belongs to the wallet{" "}
                                {preview.existingSignerId}, which is already in
                                the system. Selected accounts will be added to
                                it. If the wallet is locked, it will be unlocked
                                with the entered password.
                            </div>
                        )}

                        <div className="wallet-create-modal__row">
                            <label>
                                {`Accounts of the ${WALLET_TYPE_LABEL[preview.walletType]} wallet`}
                            </label>
                            <div className="import-keyfile-wallet-modal__accounts">
                                {preview.accounts.map(
                                    ({
                                        name,
                                        index,
                                        address,
                                        status,
                                    }: IKeyfileImportAccountPreview) => {
                                        const isImported =
                                            status ===
                                            KeyfileImportAccountStatus.ALREADY_IMPORTED;

                                        return (
                                            <label
                                                className="import-keyfile-wallet-modal__account"
                                                key={address}
                                            >
                                                <input
                                                    type="checkbox"
                                                    disabled={
                                                        isImported ||
                                                        index === null
                                                    }
                                                    checked={
                                                        index !== null &&
                                                        selectedIndexes.includes(
                                                            index,
                                                        )
                                                    }
                                                    onChange={() =>
                                                        index !== null &&
                                                        toggleAccount(index)
                                                    }
                                                />
                                                <span className="import-keyfile-wallet-modal__account-name">
                                                    {index === null
                                                        ? name
                                                        : `#${index} ${name}`}
                                                </span>
                                                <span className="import-keyfile-wallet-modal__account-address">
                                                    {address}
                                                </span>
                                                {isImported && (
                                                    <span className="import-keyfile-wallet-modal__badge">
                                                        already imported
                                                    </span>
                                                )}
                                            </label>
                                        );
                                    },
                                )}
                            </div>
                        </div>

                        {localError && (
                            <div className="wallet-create-modal__error">
                                {localError}
                            </div>
                        )}

                        <div className="wallet-create-modal__actions">
                            <button
                                className="wallet-create-modal__button"
                                type="button"
                                onClick={handleImportSubmit}
                            >
                                Import
                            </button>
                            <button
                                className="wallet-create-modal__button wallet-create-modal__button--secondary"
                                type="button"
                                onClick={backToKeyfileStep}
                            >
                                Back
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImportKeyfileWalletModal;
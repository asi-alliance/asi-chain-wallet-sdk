import { WalletTypes } from "asi-wallet-sdk";
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
}

export interface IImportKeyfileWalletModalProps {
    title?: string;
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

const ImportKeyfileWalletModal = ({
    title,
    onSubmit,
    onClose,
}: IImportKeyfileWalletModalProps): ReactElement => {
    const [selectedKeyfile, setSelectedKeyfile] =
        useState<ISelectedKeyfile | null>(null);
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

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLocalError(null);

        if (!selectedKeyfile) {
            setLocalError("Please select a keyfile first.");
            return;
        }

        const formData = new FormData(event.currentTarget);
        const password = (formData.get("password") as string) ?? "";

        onSubmit({ keyfile: selectedKeyfile.content, password });
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

                <form
                    className="wallet-create-modal__form"
                    onSubmit={handleSubmit}
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
                        >
                            Submit
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
            </div>
        </div>
    );
};

export default ImportKeyfileWalletModal;
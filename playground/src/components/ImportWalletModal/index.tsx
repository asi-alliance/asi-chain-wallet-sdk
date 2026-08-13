import CreateWalletModal, {
    type TWalletCreatePayload,
} from "@components/CreateWalletModal";
import {
    useState,
    type ChangeEvent,
    type FormEvent,
    type ReactElement,
} from "react";
import "./style.css";

export type TWalletImportSource = "secret" | "keyfile";

export interface IKeyfileImportPayload {
    keyfile: string;
    password: string;
}

export interface IImportWalletModalProps {
    variant?: 12 | 24;
    mode: "privateKey" | "mnemonic";
    title?: string;
    onSubmitSecret: (payload: TWalletCreatePayload) => void;
    onSubmitKeyfile: (payload: IKeyfileImportPayload) => void;
    onClose?: () => void;
}

interface ISelectedKeyfile {
    name: string;
    content: string;
}

const ImportWalletModal = ({
    variant = 12,
    mode,
    title,
    onSubmitSecret,
    onSubmitKeyfile,
    onClose,
}: IImportWalletModalProps): ReactElement => {
    const [source, setSource] = useState<TWalletImportSource>("secret");
    const [selectedKeyfile, setSelectedKeyfile] =
        useState<ISelectedKeyfile | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);

    const secretOptionLabel =
        mode === "privateKey" ? "Private key" : "Mnemonic phrase";

    const handleSourceChange = (event: ChangeEvent<HTMLSelectElement>) => {
        setLocalError(null);
        setSource(event.target.value as TWalletImportSource);
    };

    const sourceRow = (
        <div className="wallet-create-modal__row">
            <label htmlFor="importSource">Import source</label>
            <select
                className="import-wallet-modal__select"
                id="importSource"
                name="importSource"
                value={source}
                onChange={handleSourceChange}
            >
                <option value="secret">{secretOptionLabel}</option>
                <option value="keyfile">Keyfile</option>
            </select>
        </div>
    );

    if (source === "secret") {
        return (
            <CreateWalletModal
                variant={variant}
                mode={mode}
                isInputMode
                title={title}
                headerContent={sourceRow}
                onSubmit={onSubmitSecret}
                onClose={onClose}
            />
        );
    }

    const handleKeyfileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];

        setLocalError(null);

        if (!file) {
            setSelectedKeyfile(null);
            return;
        }

        try {
            setSelectedKeyfile({ name: file.name, content: await file.text() });
        } catch {
            setSelectedKeyfile(null);
            setLocalError("Keyfile cannot be read.");
        }
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

        onSubmitKeyfile({ keyfile: selectedKeyfile.content, password });
    };

    return (
        <div className="wallet-create-modal__overlay">
            <div className="wallet-create-modal__content">
                <div className="wallet-create-modal__header">
                    <h2 className="wallet-create-modal__title">
                        {title ?? "Import wallet"}
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
                    {sourceRow}

                    <div className="wallet-create-modal__row">
                        <label htmlFor="keyfile">Keyfile</label>
                        <input
                            className="import-wallet-modal__file"
                            id="keyfile"
                            name="keyfile"
                            type="file"
                            accept="application/json,.json"
                            onChange={handleKeyfileChange}
                        />
                        <span className="wallet-create-modal__hint">
                            {selectedKeyfile
                                ? `Loaded: ${selectedKeyfile.name}`
                                : "Not provided"}
                        </span>
                    </div>

                    <div className="wallet-create-modal__row">
                        <label htmlFor="password">Keyfile password</label>
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

export default ImportWalletModal;
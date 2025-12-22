import { useMemo, useState, type FormEvent, type ReactElement } from "react";
import InputsForm from "../InputsForm";
import "./style.css";

export type TWalletCreatePayload =
    | {
          mode: "privateKey";
          name: string;
          privateKey: string;
          password: string;
      }
    | {
          mode: "mnemonic";
          name: string;
          mnemonicWords: string[];
          password: string;
      };

export interface IWalletCreateModalProps {
    variant?: 12 | 24;
    mode: "privateKey" | "mnemonic";
    isInputMode: boolean;
    title?: string;
    onSubmit: (payload: TWalletCreatePayload) => void;
    onClose: () => void;
    initialMnemonic?: string[];
    initialPrivateKey?: string;
}

const CreateWalletModal = ({
    variant = 12,
    mode,
    title,
    onSubmit,
    onClose,
    isInputMode,
    initialMnemonic = [],
    initialPrivateKey = "",
}: IWalletCreateModalProps): ReactElement => {
    const [localError, setLocalError] = useState<string | null>(null);
    const [isMnemonicModalOpen, setIsMnemonicModalOpen] = useState(false);
    const [mnemonicWords, setMnemonicWords] = useState<string[]>(initialMnemonic);

    const computedTitle = useMemo(() => {
        if (title) return title;
        return mode === "privateKey"
            ? "Add private key wallet"
            : "Derive mnemonic wallet";
    }, [mode, title]);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLocalError(null);

        const formData = new FormData(event.currentTarget);

        const name = (formData.get("name") as string) ?? "";
        const privateKey = (formData.get("privateKey") as string) ?? "";
        const password = (formData.get("password") as string) ?? "";
        const repassword = (formData.get("repassword") as string) ?? "";

        if (password !== repassword) {
            setLocalError("Passwords do not match.");
            return;
        }

        if (mode === "privateKey") {
            if (!privateKey.trim()) {
                setLocalError("Private key is required.");
                return;
            }

            onSubmit({
                mode: "privateKey",
                name: name.trim(),
                privateKey: privateKey.trim(),
                password,
            });

            return;
        }

        if (!mnemonicWords.length) {
            setLocalError("Please provide a mnemonic first (click Show).");
            return;
        }

        onSubmit({
            mode: "mnemonic",
            name: name.trim(),
            mnemonicWords,
            password,
        });
    };

    const openMnemonicModal = () => {
        setLocalError(null);
        setIsMnemonicModalOpen(true);
    };

    const closeMnemonicModal = () => setIsMnemonicModalOpen(false);

    const handleMnemonicSubmit = (normalizedWords: string[]) => {
        setMnemonicWords(normalizedWords);
        setIsMnemonicModalOpen(false);
    };

    return (
        <div className="wallet-create-modal__overlay">
            <div className="wallet-create-modal__content">
                <div className="wallet-create-modal__header">
                    <h2 className="wallet-create-modal__title">
                        {computedTitle}
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
                        <label htmlFor="name">Name</label>
                        <input id="name" name="name" type="text" required />
                    </div>

                    {mode === "privateKey" ? (
                        <div className="wallet-create-modal__row">
                            <label htmlFor="privateKey">Private key</label>
                            <input
                                id="privateKey"
                                name="privateKey"
                                type="text"
                                placeholder=""
                                autoComplete="off"
                                required
                                defaultValue={initialPrivateKey}
                                readOnly={!isInputMode}
                            />
                        </div>
                    ) : (
                        <div className="wallet-create-modal__row">
                            <label>Mnemonic</label>
                            <div className="wallet-create-modal__inline">
                                <button
                                    className="wallet-create-modal__button"
                                    type="button"
                                    onClick={openMnemonicModal}
                                >
                                    Show
                                </button>
                                <span className="wallet-create-modal__hint">
                                    {mnemonicWords.length
                                        ? `Loaded: ${mnemonicWords.length} words`
                                        : "Not provided"}
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="wallet-create-modal__row">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="off"
                            required
                        />
                    </div>

                    <div className="wallet-create-modal__row">
                        <label htmlFor="repassword">Re-password</label>
                        <input
                            autoComplete="off"
                            id="repassword"
                            name="repassword"
                            type="password"
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

            {isMnemonicModalOpen && (
                <div className="wallet-create-modal__overlay wallet-create-modal__overlay--nested">
                    <div className="wallet-create-modal__content wallet-create-modal__content--nested">
                        <div className="wallet-create-modal__header">
                            <h3 className="wallet-create-modal__title">
                                Mnemonic phrase
                            </h3>
                            <button
                                className="wallet-create-modal__close"
                                type="button"
                                onClick={closeMnemonicModal}
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>

                        <InputsForm
                            variant={variant}
                            onValidSubmit={handleMnemonicSubmit}
                            formMode={isInputMode ? "input" : "output"}
                            onClose={() => setIsMnemonicModalOpen(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default CreateWalletModal;

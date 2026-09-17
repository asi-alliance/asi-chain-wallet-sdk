import { useState, type FormEvent, type ReactElement } from "react";
import "./style.css";
import { toAccountNameError } from "../../sdk-react-kit";

export interface IDeriveWalletModalProps {
    onSubmit: (name: string, password: string) => void;
    onClose?: () => void;
}

const DeriveWalletModal = ({
    onSubmit,
    onClose,
}: IDeriveWalletModalProps): ReactElement => {
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLocalError(null);

        const formData = new FormData(event.currentTarget);

        const name = ((formData.get("name") as string) ?? "").trim();
        const password = (formData.get("password") as string) ?? "";

        const nameError = toAccountNameError(name);

        if (nameError) {
            setLocalError(nameError);

            return;
        }

        onSubmit(name, password);
    };

    return (
        <div className="wallet-create-modal__overlay">
            <div className="wallet-create-modal__content">
                <div className="wallet-create-modal__header">
                    <h2 className="wallet-create-modal__title">
                        Derive Wallet
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

export default DeriveWalletModal;

import { useState, type FormEvent, type ReactElement } from "react";
import "./style.css";

export interface IDeriveWalletModalProps {
    onSubmit: (name: string, password: string, index: number) => void;
    onClose?: () => void;
    index: number;
}

const DeriveWalletModal = ({
    onSubmit,
    onClose,
    index = 0,
}: IDeriveWalletModalProps): ReactElement => {
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLocalError(null);

        const formData = new FormData(event.currentTarget);

        const name = (formData.get("name") as string) ?? "";
        const password = (formData.get("password") as string) ?? "";
        const repassword = (formData.get("repassword") as string) ?? "";

        if (password !== repassword) {
            setLocalError("Passwords do not match.");
            return;
        }

        onSubmit(name.trim(), password, index);
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
        </div>
    );
};

export default DeriveWalletModal;

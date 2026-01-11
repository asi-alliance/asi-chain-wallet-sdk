import { type FormEvent, type ReactElement } from "react";
import "./style.css";

export interface IPasswordModalProps {
    title: string;
    onSubmit: (password: string) => void;
    onClose?: () => void;
}

const PasswordModal = ({
    title,
    onSubmit,
    onClose,
}: IPasswordModalProps): ReactElement => {
    console.log(onClose);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);
        const password = formData.get("password") as string;

        onSubmit(password);
    };

    return (
        <div className="password-modal">
            <div className="password-input-form">
                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <label htmlFor="password">{title}</label>
                        <input
                            autoComplete="off"
                            type="password"
                            id="password"
                            name="password"
                            required
                        />
                    </div>
                    <div className="form-actions">
                        <button className="submit-button" type="submit">
                            Submit
                        </button>
                        {!!onClose && (
                            <button
                                className="cancel-button"
                                type="button"
                                onClick={onClose}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PasswordModal;

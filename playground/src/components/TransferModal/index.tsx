import { type FormEvent, type ReactElement } from "react";
import "./style.css";

export interface ITransferModalProps {
    toAddress: string;
    amount: number;
    commission: number;
    onConfirm: (toAddress: string, amount: number) => void;
    onCancel: () => void;
}

const TransferModal = ({
    toAddress,
    amount,
    commission,
    onConfirm,
    onCancel,
}: ITransferModalProps): ReactElement => {
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);
        const toAddress = (formData.get("toAddress") as string) ?? "";
        const amountValueRaw = formData.get("amount") as string;
        const amountValue = Number(amountValueRaw);

        onConfirm(toAddress, amountValue);
    };

    return (
        <div className="transfer-modal">
            <div className="transfer-modal-form">
                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <label htmlFor="toAddress">To Address:</label>
                        <input
                            type="text"
                            id="toAddress"
                            name="toAddress"
                            defaultValue={toAddress}
                            required
                        />
                    </div>
                    <div className="form-row">
                        <label htmlFor="amount">Amount:</label>
                        <input
                            type="number"
                            id="amount"
                            name="amount"
                            defaultValue={amount}
                            required
                        />
                    </div>
                    <div className="form-row">
                        <label htmlFor="commission">Commission:</label>
                        <input
                            type="number"
                            id="commission"
                            name="commission"
                            defaultValue={commission}
                            step="any"
                            required
                        />
                    </div>
                    <div className="form-actions">
                        <button className="submit-button" type="submit">
                            Send
                        </button>
                        <button
                            className="cancel-button"
                            type="button"
                            onClick={onCancel}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TransferModal;

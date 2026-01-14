import { fromAtomicAmount, toAtomicAmount } from "asi-wallet-sdk";
import { type FormEvent, type ReactElement } from "react";
import "./style.css";

export interface ITransferModalProps {
    currentBalance: bigint;
    toAddress: string;
    amount: bigint;
    commission: number;
    onConfirm: (toAddress: string, amount: bigint) => void;
    onClose: () => void;
}

const TransferModal = ({
    currentBalance,
    toAddress,
    amount,
    commission,
    onConfirm,
    onClose,
}: ITransferModalProps): ReactElement => {
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            const formData = new FormData(event.currentTarget);
            const toAddress = (formData.get("toAddress") as string) ?? "";
            const amountValueRaw = formData.get("amount") as string;

            const atomicValueToTransfer = toAtomicAmount(amountValueRaw);

            // alert(`${currentBalance}, ${atomicValueToTransfer}`)
            if (atomicValueToTransfer <= 0n) {
                alert("Invalid amount");
                return;
            }

            if (currentBalance < atomicValueToTransfer) {
                alert("Insufficient balance for this transfer.");
                return;
            }
            // if (currentBalance < amountValue + commission) {
            //     alert("Insufficient balance for this transfer including commission.");
            //     return;
            // }

            onConfirm(toAddress, atomicValueToTransfer);
        } catch (error) {
            alert(error?.message);
        }
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
                            type="text"
                            id="amount"
                            name="amount"
                            defaultValue={fromAtomicAmount(amount)}
                            required
                        />
                    </div>
                    {/* <div className="form-row">
                        <label htmlFor="commission">Commission:</label>
                        <input
                            type="number"
                            id="commission"
                            name="commission"
                            defaultValue={commission}
                            step="any"
                            required
                        />
                    </div> */}
                    <div className="form-actions">
                        <button className="submit-button" type="submit">
                            Send
                        </button>
                        <button
                            className="cancel-button"
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

export default TransferModal;

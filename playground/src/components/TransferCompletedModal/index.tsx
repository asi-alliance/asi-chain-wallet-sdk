import { useState, type ReactElement } from "react";
import { fromAtomicAmount } from "asi-wallet-sdk";
import "./style.css";

export interface ITransferCompletedModalProps {
    fromAddress: string;
    toAddress: string;
    amount: bigint;
    deployId: string;
    onClose: () => void;
}

const TransferCompletedModal = ({
    fromAddress,
    toAddress,
    amount,
    deployId,
    onClose,
}: ITransferCompletedModalProps): ReactElement => {
    const [isDeployIdCopied, setIsDeployIdCopied] = useState<boolean>(false);

    const copyDeployId = async () => {
        try {
            await navigator.clipboard.writeText(deployId);

            setIsDeployIdCopied(true);

            setTimeout(() => {
                setIsDeployIdCopied(false);
            }, 3000);
        } catch (error) {
            console.error("Error copying text: ", error);
        }
    };

    return (
        <div className="wallet-create-modal__overlay">
            <div className="wallet-create-modal__content">
                <div className="wallet-create-modal__header">
                    <h2 className="wallet-create-modal__title">
                        Transfer Completed
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

                <div className="wallet-create-modal__row">
                    <label htmlFor="from">From</label>
                    <input
                        id="from"
                        name="from"
                        type="text"
                        readOnly
                        value={fromAddress}
                    />
                </div>

                <div className="wallet-create-modal__row">
                    <label htmlFor="to">To</label>
                    <input
                        id="to"
                        name="to"
                        type="text"
                        readOnly
                        value={toAddress}
                    />
                </div>

                <div className="wallet-create-modal__row">
                    <label htmlFor="amount">Amount</label>
                    <input
                        id="amount"
                        name="amount"
                        type="text"
                        readOnly
                        value={fromAtomicAmount(amount)}
                    />
                </div>

                <div className="wallet-create-modal__row">
                    <label htmlFor="deployId">Deploy ID</label>
                    <input
                        id="deployId"
                        name="deployId"
                        type="text"
                        autoComplete="off"
                        readOnly
                        value={deployId}
                    />
                </div>

                <p>
                    Tokens have been successfully transferred!
                    <br></br>
                    It takes some time for them to arrive!
                    <br></br>
                    You can track the transaction using the Deploy ID above.
                </p>

                <div className="wallet-create-modal__actions">
                    <button
                        className="wallet-create-modal__button wallet-create-modal__button--secondary"
                        type="button"
                        onClick={onClose}
                    >
                        CLOSE
                    </button>
                    <button
                        className="wallet-create-modal__button wallet-create-modal__button--primary"
                        onClick={copyDeployId}
                        disabled={isDeployIdCopied}
                    >
                        {isDeployIdCopied ? "Copied" : "Copy deployId"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TransferCompletedModal;

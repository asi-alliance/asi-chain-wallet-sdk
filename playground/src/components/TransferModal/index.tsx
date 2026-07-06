import {
    fromAtomicAmount,
    toAtomicAmount,
    NATIVE_TOKEN_DECIMALS_AMOUNT,
} from "asi-wallet-sdk";
import {
    ChangeEvent,
    useCallback,
    useMemo,
    useState,
    type FormEvent,
    type ReactElement,
} from "react";
import "./style.css";
import {
    HighlightedRows,
    type IHighlightedRowsProps,
} from "@components/common/HighlightedRows";

const COIN_NAME = "ASI";

export interface ITransferModalProps {
    fromAddress: string;
    availableBalance: bigint;
    onConfirm: (toAddress: string, amount: bigint) => void;
    onClose: () => void;
}

const TransferModal = ({
    fromAddress,
    availableBalance,
    onConfirm,
    onClose,
}: ITransferModalProps): ReactElement => {
    const [toAddress, setToAddress] = useState<string>("");
    const [toAddressTouched, setToAddressTouched] = useState(false);
    const [amountInput, setAmountInput] = useState<string>("");
    const [amountTouched, setAmountTouched] = useState(false);

    const { amount, amountError } = useMemo(() => {
        if (!amountInput.trim()) {
            return { amount: null, amountError: "Amount is required" };
        }

        try {
            const parsed = toAtomicAmount(
                amountInput,
                NATIVE_TOKEN_DECIMALS_AMOUNT,
            );

            if (parsed <= 0n) {
                return { amount: null, amountError: "Amount must be positive" };
            }

            if (parsed > availableBalance) {
                return {
                    amount: null,
                    amountError: "Amount exceeds available balance",
                };
            }

            return { amount: parsed, amountError: null };
        } catch (error) {
            return {
                amount: null,
                amountError:
                    error instanceof Error
                        ? error.message
                        : "Invalid amount format",
            };
        }
    }, [amountInput, availableBalance]);

    const toAddressError = toAddress.trim() ? null : "Recipient is required";
    const isValid = !toAddressError && !amountError && amount !== null;

    const detailsRows = useMemo<IHighlightedRowsProps["rows"]>(
        () => [
            {
                label: "Available:",
                value: `${fromAtomicAmount(
                    availableBalance,
                    NATIVE_TOKEN_DECIMALS_AMOUNT,
                )} ${COIN_NAME}`,
            },
            {
                label: "Amount to send:",
                value:
                    amount === null
                        ? "N/A"
                        : `${fromAtomicAmount(
                              amount,
                              NATIVE_TOKEN_DECIMALS_AMOUNT,
                          )} ${COIN_NAME}`,
                accented: true,
            },
        ],
        [availableBalance, amount],
    );

    const onToAddressChange = useCallback((event: ChangeEvent) => {
        setToAddressTouched(true);
        setToAddress((event.target as HTMLInputElement).value);
    }, []);

    const onAmountChange = useCallback((event: ChangeEvent) => {
        setAmountTouched(true);
        setAmountInput((event.target as HTMLInputElement).value);
    }, []);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!isValid || amount === null) {
            return;
        }

        onConfirm(toAddress.trim(), amount);
    };

    return (
        <div className="transfer-modal">
            <div className="transfer-modal-form">
                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <label htmlFor="fromAddress">From:</label>
                        <input
                            type="text"
                            id="fromAddress"
                            name="fromAddress"
                            value={fromAddress}
                            readOnly
                        />
                    </div>

                    <div className="form-row">
                        <label htmlFor="toAddress">To Address:</label>
                        <input
                            type="text"
                            id="toAddress"
                            name="toAddress"
                            onChange={onToAddressChange}
                            value={toAddress}
                            required
                        />
                        <div className="form-error-slot">
                            {toAddressTouched && toAddressError && (
                                <div className="form-error">
                                    {toAddressError}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="form-row">
                        <label htmlFor="amount">Amount:</label>
                        <input
                            type="text"
                            id="amount"
                            name="amount"
                            onChange={onAmountChange}
                            value={amountInput}
                            required
                        />
                        <div className="form-error-slot">
                            {amountTouched && amountError && (
                                <div className="form-error">{amountError}</div>
                            )}
                        </div>
                    </div>

                    <div className="form-row transfer-details">
                        <HighlightedRows
                            title="Transfer details"
                            rows={detailsRows}
                        />
                    </div>

                    <div className="form-actions">
                        <button
                            className="submit-button"
                            type="submit"
                            disabled={!isValid}
                        >
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

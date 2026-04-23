import { fromAtomicAmount, toAtomicAmount, GasFeeVO, FeeService, COIN_NAME, fromAtomicAmountToString, AssetsService } from "asi-wallet-sdk";
import { ChangeEvent, useCallback, useMemo, useState, type FormEvent, type ReactElement } from "react";
import "./style.css";
import { HighlightedRows, IHighlightedRowsProps } from "@components/common/HighlightedRows";
import { superficialAmoutValidation } from "./superficialAmoutValidation";

export interface ITransferModalProps {
    currentBalance: bigint;
    toAddress: string;
    amount: bigint;
    gasFee: GasFeeVO;
    onConfirm: (toAddress: string, amount: bigint, gasFee: GasFeeVO) => void;
    onClose: () => void;
}

const TransferModal = ({
    currentBalance,
    toAddress,
    amount: initialAmount,
    gasFee,
    onConfirm,
    onClose,
}: ITransferModalProps): ReactElement => {
    const gasFeeView = useMemo(() => (
        FeeService.getGasFeeView(gasFee)
    ), [gasFee]);

    const [amount, setAmount] = useState<bigint | null>(initialAmount);
    const [amountError, setAmountError] = useState<string>(null);

    const estimatedTotalAmount = useMemo(() => {
        return fromAtomicAmountToString(amount + gasFee.gasFee);
    }, [amount, gasFee]);

    const maxTotalAmount = useMemo(() => {
        return fromAtomicAmountToString(amount + gasFee.gasFeeRange.max);
    }, [amount, gasFee]);
    
    const transferDetailsRows = useMemo((): IHighlightedRowsProps["rows"] => {
        return [
            {
                label: "Estimated gas fee:",
                value: `${gasFeeView.gasFee} ${COIN_NAME}`,
            },
            {
                label: "Estimated total amount:",
                value: `${amountError !== null ? "N/A" : estimatedTotalAmount} ${COIN_NAME}`,
                accented: true,
                description: "Attention! This is not the maximum estimation! It may be higher! See 'Max total amount' below.",
            },
            {
                label: "Gas fee range:",
                value: `${gasFeeView.gasFeeRange.min} - ${gasFeeView.gasFeeRange.max} ${COIN_NAME}`
            },
            {
                label: "Max total amount:",
                value: `${amountError !== null ? "N/A" : maxTotalAmount} ${COIN_NAME}`,
                description: "The maximum amount that can be charged for transfer + gas fee. This amount of funds will be temporarily reserved until the transaction is completed. Any funds not spent on gas fees will be returned to the wallet."
            },

        ]
    }, [gasFeeView, estimatedTotalAmount, maxTotalAmount, amountError]);

    const onAmountChange = useCallback((event: ChangeEvent) => {
        const value = (event.target as HTMLInputElement).value;
        try {
            const atomic = toAtomicAmount(value);
            if(!superficialAmoutValidation(atomic)) {
                throw new Error("superficial validation failed");
            }
            setAmount(atomic);
            setAmountError(null);
        } catch(error) {
            console.error(error);
            setAmount(0n);
            setAmountError(error.message);
        }
        
    }, []);

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            const formData = new FormData(event.currentTarget);
            const toAddress = (formData.get("toAddress") as string) ?? "";
            const amountValueRaw = formData.get("amount") as string;

            const atomicValueToTransfer = toAtomicAmount(amountValueRaw);

            if (atomicValueToTransfer <= 0n) {
                alert("Invalid amount");
                return;
            }

            if (currentBalance < atomicValueToTransfer) {
                alert("Insufficient balance for this transfer.");
                return;
            }
            if (currentBalance < AssetsService.getEstimatedTotalTransferAmount(amount, gasFee)) {
                alert("Insufficient balance for this transfer including gas fee.");
                return;
            }
            if (currentBalance < AssetsService.getMaxTotalTransferAmount(amount, gasFee)) {
                alert("Insufficient balance for this transfer including max possible gas fee.");
                return;
            }

            onConfirm(toAddress, atomicValueToTransfer, gasFee);
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
                            onChange={onAmountChange}
                            defaultValue={fromAtomicAmount(amount)}
                            required
                        />
                    </div>
                    <div className="form-row transfer-details">
                        <HighlightedRows title="Transfer details" rows={transferDetailsRows}/>
                    </div>
                    
                    
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

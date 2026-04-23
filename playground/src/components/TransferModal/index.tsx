import { fromAtomicAmount, toAtomicAmount, GasFeeVO, FeeService, COIN_NAME, fromAtomicAmountToString, TransferValidator, Address } from "asi-wallet-sdk";
import { ChangeEvent, useCallback, useMemo, useState, type FormEvent, type ReactElement } from "react";
import "./style.css";
import { HighlightedRows, IHighlightedRowsProps } from "@components/common/HighlightedRows";

export interface ITransferModalProps {
    currentBalance: bigint;
    fromAddress: string;
    toAddress: string;
    amount: bigint;
    gasFee: GasFeeVO;
    onConfirm: (toAddress: string, balance: bigint, amount: bigint, gasFee: GasFeeVO) => void;
    onClose: () => void;
}

const TransferModal = ({
    currentBalance,
    fromAddress,
    toAddress: toAddressInitial,
    amount: initialAmount,
    gasFee,
    onConfirm,
    onClose,
}: ITransferModalProps): ReactElement => {
    const gasFeeView = useMemo(() => (
        FeeService.getGasFeeView(gasFee)
    ), [gasFee]);

    const [amountInput, setAmountInput] = useState(fromAtomicAmount(initialAmount));
    const [amountTouched, setAmountTouched] = useState(false);
    const [toAddress, setToAddress] = useState<string>(toAddressInitial ?? "");
    const [toAddressTouched, setToAddressTouched] = useState(false);

    const { amount, amountParsingError } = useMemo(() => {
        try {
            return {
                amount: toAtomicAmount(amountInput),
                amountParsingError: null,
            };
        } catch (error) {
            return {
                amount: null,
                amountParsingError: error instanceof Error ? error.message : "Invalid amount format",
            };
        }
    }, [amountInput]);

    const { toAddressError, amountValidationError } = useMemo(() => {
        try {
            TransferValidator.validate(fromAddress as Address, toAddress as Address, currentBalance, amount ?? 0n, gasFee, "");
            return {
                toAddressError: null,
                amountValidationError: null,
            };
        } catch (error) {
            return {
                toAddressError: error?.addressValidationError?.message ?? null,
                amountValidationError: error?.amountValidationError?.message ?? null,
            };
        }
    }, [fromAddress, toAddress, currentBalance, amount, gasFee]);

    const amountError = amountParsingError ?? amountValidationError;
    const safeAmount = amount ?? 0n;
    
    const estimatedTotalAmount = useMemo(() => {
        return fromAtomicAmountToString(safeAmount + gasFee.gasFee);
    }, [safeAmount, gasFee]);

    const maxTotalAmount = useMemo(() => {
        return fromAtomicAmountToString(safeAmount + gasFee.gasFeeRange.max);
    }, [safeAmount, gasFee]);
    
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

        try {
            if (amount === null) {
                throw new Error(amountParsingError ?? "Invalid amount format");
            }
            onConfirm(toAddress, currentBalance, amount, gasFee);
        } catch (error) {
            alert(error?.message);
            //TODO: parse and show the error;
        }
    };
    const isValid = !toAddressError && !amountError;

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
                            onChange={onToAddressChange}
                            defaultValue={toAddress}
                            required
                        />
                        {toAddressTouched && toAddressError}
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
                        {amountTouched && amountError}
                    </div>
                    <div className="form-row transfer-details">
                        <HighlightedRows title="Transfer details" rows={transferDetailsRows}/>
                    </div>
                    
                    
                    <div className="form-actions">
                        <button className="submit-button" type="submit" disabled={!isValid}>
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

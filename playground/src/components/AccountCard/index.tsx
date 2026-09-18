import { useState, type ReactElement } from "react";
import { useAppContext } from "@components/Application/context";
import { Modals } from "@components/Application/meta";
import { Account, ExportKeyfileService, type Address } from "asi-wallet-sdk";
import ReservationStatus from "@components/ReservationStatus";
import "./style.css";
import type { UseSdkValue } from "../../sdk-react-kit";
import { formatAssetAmount, toErrorText } from "../../sdk-react-kit";
import { useWalletBalance } from "../../sdk-react-kit/hooks/useWalletBalance";
import { downloadTextFile } from "@utils/functions";
import useSecureAction from "@hooks/useSecureAction";

export interface IAccountCardProps {
    sdk: UseSdkValue;
    walletId: string;
    account: Account;
    onRename: () => void;
    onRemove?: () => void;
}

const getBalanceLabel = (
    available: bigint | null,
    isFetching: boolean,
    error: string | null,
): string => {
    if (isFetching) {
        return "loading balance ...";
    }

    if (error) {
        return "balance unavailable";
    }

    return formatAssetAmount(available);
};

const AccountCard = ({
    sdk,
    walletId,
    account,
    onRename,
    onRemove,
}: IAccountCardProps): ReactElement => {
    const { setModalState, withLoader } = useAppContext();
    const runSecureAction = useSecureAction();

    const address = account.getAddress();
    const accountId = account.getId();
    const index = account.getIndex();

    const { balance, reservationCount, isFetching, error, reload } =
        useWalletBalance(sdk, walletId, accountId, address);

    const [isCopied, setIsCopied] = useState<boolean>(false);
    const [isSending, setIsSending] = useState<boolean>(false);

    const canSend = (balance.available ?? 0n) > 0n;

    const closeModal = () => setModalState({ type: null });

    const transfer = async (toAddress: Address, amount: bigint) => {
        try {
            setIsSending(true);

            const reserved = await runSecureAction({
                walletId,
                passwordTitle: "Enter wallet password to send",
                confirmMessage: `Send ${formatAssetAmount(amount)} to ${toAddress}?`,
                action: (password?: string) =>
                    withLoader(async () => {
                        const result = await sdk.transfer(
                            { walletId, accountId, to: toAddress, amount },
                            password,
                        );

                        await reload();

                        return result;
                    }),
            });

            if (!reserved) {
                return;
            }

            reserved.subscribe({
                onConfirmed: reload,
                onError: reload,
            });

            setModalState({
                type: Modals.TRANSFER_COMPLETED_MODAL,
                props: {
                    deployId: reserved.deployId,
                    fromAddress: address,
                    toAddress,
                    amount,
                    onClose: closeModal,
                },
            });
        } catch (error) {
            console.error(error);
            alert(toErrorText(error, "Transfer failed"));
        } finally {
            setIsSending(false);
        }
    };

    const openTransferModal = () =>
        setModalState({
            type: Modals.TRANSFER_MODAL,
            props: {
                fromAddress: address,
                availableBalance: balance.available ?? 0n,
                onConfirm: (toAddress: Address, amount: bigint) => {
                    closeModal();
                    void transfer(toAddress, amount);
                },
                onClose: closeModal,
            },
        });

    const exportAccount = () => {
        try {
            const keyfile = sdk.getExportedAccountData(walletId, accountId);

            downloadTextFile(
                `asi-keyfile-${account.getName()}.json`,
                ExportKeyfileService.toJSON(keyfile),
                "application/json",
            );
        } catch (error) {
            console.error(error);
            alert(toErrorText(error, "Export failed"));
        }
    };

    const copyAddress = async () => {
        try {
            await navigator.clipboard.writeText(address);

            setIsCopied(true);

            setTimeout(() => {
                setIsCopied(false);
            }, 3000);
        } catch (error) {
            console.error("Error copying text: ", error);
        }
    };

    return (
        <div className="account-card">
            <div className="account-card-index">
                {index === null ? "null" : index}
            </div>
            <div className="account-card-body">
                <div className="account-card-head">
                    <div className="account-card-name">{account.getName()}</div>
                </div>
                <div className="account-card-address">{address}</div>
                <div className="account-card-balance">
                    balance:{" "}
                    {getBalanceLabel(balance.available, isFetching, error)}
                </div>
                <ReservationStatus
                    balance={balance}
                    reservationCount={reservationCount}
                    isFetching={isFetching}
                    error={error}
                />
                <div className="buttons">
                    <button
                        className="account-card-button"
                        onClick={openTransferModal}
                        disabled={isSending || isFetching || !canSend}
                    >
                        Send
                    </button>
                    <button
                        className="account-card-button"
                        onClick={reload}
                        disabled={isFetching || isSending}
                    >
                        Reload balance
                    </button>
                    <button className="account-card-button" onClick={onRename}>
                        Rename
                    </button>
                    <button
                        className="account-card-button"
                        onClick={copyAddress}
                        disabled={isCopied}
                    >
                        {isCopied ? "Copied" : "Copy address"}
                    </button>
                    <button
                        className="account-card-button"
                        onClick={exportAccount}
                    >
                        Export
                    </button>
                    {onRemove && (
                        <button
                            className="account-card-button account-card-button--danger"
                            type="button"
                            onClick={onRemove}
                        >
                            Remove
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AccountCard;

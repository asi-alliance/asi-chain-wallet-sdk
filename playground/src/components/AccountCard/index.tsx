import { useState, type ReactElement } from "react";
import { useAppContext } from "@components/Application/context";
import { Modals } from "@components/Application/meta";
import { Account, ExportKeyfileService } from "asi-wallet-sdk";
import ReservationStatus from "@components/ReservationStatus";
import "./style.css";
import type { UseSdkValue } from "../../sdk-react-kit";
import { formatAmount } from "../../sdk-react-kit";
import { useWalletBalance } from "../../sdk-react-kit/hooks/useWalletBalance";
import { downloadTextFile } from "@utils/functions";
import useSecureAction from "@hooks/useSecureAction";

export interface IAccountCardProps {
    sdk: UseSdkValue;
    walletId: string;
    account: Account;
    onRename: () => void;
    onRemove: () => void;
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

    return `${formatAmount(available)} ASI`;
};

const AccountCard = ({
    sdk,
    walletId,
    account,
    onRename,
    onRemove,
}: IAccountCardProps): ReactElement => {
    const { setModalState } = useAppContext();
    const runSecureAction = useSecureAction();

    const address = account.getAddress();
    const accountId = account.getId();
    const index = account.getIndex();

    const { balance, isFetching, error, reload } = useWalletBalance(
        sdk,
        walletId,
        accountId,
        address,
    );

    const [isCopied, setIsCopied] = useState<boolean>(false);
    const [isSending, setIsSending] = useState<boolean>(false);

    const canSend = (balance.available ?? 0n) > 0n;

    const closeModal = () => setModalState({ type: null });

    const transfer = async (toAddress: string, amount: bigint) => {
        try {
            setIsSending(true);

            const reserved = await runSecureAction({
                walletId,
                passwordTitle: "Enter wallet password to send",
                confirmMessage: `Send ${formatAmount(amount)} ASI to ${toAddress}?`,
                action: (password?: string) =>
                    sdk.transfer(
                        { walletId, accountId, to: toAddress as never, amount },
                        password,
                    ),
            });

            if (!reserved) {
                return;
            }

            reserved.subscribe({
                onConfirmed: reload,
                onError: reload,
            });

            await reload();

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
            alert((error as Error)?.message ?? "Transfer failed");
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
                onConfirm: (toAddress: string, amount: bigint) => {
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
            alert((error as Error)?.message ?? "Export failed");
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
            <div className="remove-block">
                <button onClick={onRemove}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="red"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-trash2-icon lucide-trash-2"
                    >
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                </button>
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
                </div>
            </div>
        </div>
    );
};

export default AccountCard;

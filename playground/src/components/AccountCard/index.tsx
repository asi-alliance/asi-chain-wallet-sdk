import { useState, type ReactElement } from "react";
import { useAppContext } from "@components/Application/context";
import { Modals } from "@components/Application/meta";
import { Account, ApiServiceRegistry } from "asi-wallet-sdk";
import ReservationStatus from "@components/ReservationStatus";
import "./style.css";
import type { UseSdkValue } from "../../sdk-react-kit";
import { formatAmount } from "../../sdk-react-kit";
import { useWalletBalance } from "../../sdk-react-kit/hooks/useWalletBalance";

export interface IAccountCardProps {
    sdk: UseSdkValue;
    walletId: string;
    account: Account;
    onRename: () => void;
    onRemove: () => void;
}

const AccountCard = ({
    sdk,
    walletId,
    account,
    onRename,
    onRemove,
}: IAccountCardProps): ReactElement => {
    const { setModalState, withLoader } = useAppContext();

    const address = account.getAddress();
    const accountId = account.getId();
    const index = account.getIndex();

    const { balance, isFetching, reload } = useWalletBalance(
        sdk,
        walletId,
        accountId,
        address,
    );

    const [isCopied, setIsCopied] = useState<boolean>(false);
    const [isSending, setIsSending] = useState<boolean>(false);

    const canSend = (balance.available ?? 0n) > 0n;

    const closeModal = () => setModalState({ type: null });

    const transfer = (toAddress: string, amount: bigint, password: string) =>
        withLoader(async () => {
            try {
                setIsSending(true);

                const deployId = await sdk.transfer(
                    { walletId, accountId, to: toAddress as never, amount },
                    password,
                );

                ApiServiceRegistry.getInstance().poller.watch(deployId, {
                    onConfirmed: reload,
                    onError: reload,
                });

                await reload();

                setModalState({
                    type: Modals.TRANSFER_COMPLETED_MODAL,
                    props: {
                        deployId,
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
        });

    const openPasswordForTransfer = (toAddress: string, amount: bigint) =>
        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Enter wallet password to send",
                onSubmit: (password: string) =>
                    transfer(toAddress, amount, password),
                onClose: closeModal,
            },
        });

    const openTransferModal = () =>
        setModalState({
            type: Modals.TRANSFER_MODAL,
            props: {
                fromAddress: address,
                availableBalance: balance.available ?? 0n,
                onConfirm: openPasswordForTransfer,
                onClose: closeModal,
            },
        });

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
                    {isFetching
                        ? "loading balance ..."
                        : `${formatAmount(balance.available)} ASI`}
                </div>
                <ReservationStatus balance={balance} isFetching={isFetching} />
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
                </div>
            </div>
        </div>
    );
};

export default AccountCard;

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useAppContext } from "@components/Application/context";
import { Modals } from "@components/Application/meta";
import {
    fromAtomicAmount,
    Address,
    Wallet,
    FundsReservationService,
    FeeService,
    GasFeeVO,
    Client,
    ReadOnlyTxStatus,
} from "asi-wallet-sdk";
import ReservationStatus from "@components/ReservationStatus";
import "./style.css";
import { ITransferModalProps } from "@components/TransferModal";
import { IPasswordModalProps } from "@components/PasswordModal";
import { useSdkContext } from "../../sdk-react-kit";
import { useWalletBalance } from "../../sdk-react-kit/hooks/useWalletBalance";

export interface IWalletCardProps {
    sdkClient: Client;
    wallet: Wallet;
    removeWallet: (id: Address) => void;
}

const WalletCard = ({
    sdkClient,
    wallet,
    removeWallet
}: IWalletCardProps): ReactElement => {
    const { setModalState, withLoader } = useAppContext();
    const {network} = useSdkContext();
    const walletBalanceValue = useWalletBalance(sdkClient, network, wallet.getAddress());

    const [isCopied, setIsCopied] = useState<boolean>(false);
    const [isSending, setIsSending] = useState<boolean>(false);
    const [isBalanceFetching, setIsBalanceFetching] = useState<boolean>(false); //TODO:

    const index = wallet.getIndex();
    const address = wallet.getAddress();
    const canSend = walletBalanceValue.walletBalance.availableBalance > 0n; //INFO/TODO: to domain

    const handlePrepareSend = (toAddress?, amount?) => {
        setModalState({
            type: Modals.TRANSFER_MODAL,
            props: {
                fromAddress: address,
                toAddress: toAddress ?? "",
                amount: amount ?? 0n,
                gasFee: FeeService.getGasFeeVO(),
                currentBalance: walletBalanceValue.walletBalance.totalBalance,
                onConfirm: handleSend,
                onClose: () => {
                    setModalState({ type: null });
                },
            } satisfies ITransferModalProps,
        });
    };

    const handleSend = (toAddress, balance, amount, gasFee: GasFeeVO) => {
        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Unlock your wallet to send ASI",
                onSubmit: (password: string) =>
                    transfer(toAddress, balance, amount, gasFee, password),
                onClose: () => {
                    setModalState({ type: null });
                },
            } satisfies IPasswordModalProps, 
        });
    };

    const transfer = (toAddress, balance, amount, gasFee: GasFeeVO, password) =>
        withLoader(async () => {
            try {
                setIsSending(true);

                // const data = await assetsService.transfer(
                const data = await sdkClient.transfer(       
                    address,
                    toAddress,
                    balance,
                    amount,
                    gasFee,
                    password,
                    wallet,
                );
                // alert("Transfer successful!");
                await walletBalanceValue.updateReservationStatus();


                setModalState({
                    type: Modals.TRANSFER_COMPLETED_MODAL,
                    props: {
                        deployId: data,
                        fromAddress: address,
                        toAddress,
                        amount,
                        onClose: () => setModalState({ type: null }),
                    },
                });
            } catch (error) {
                console.error(error);
                alert(
                    `${error?.message || "Transfer failed"}, aborting transfer.`,
                );
                handlePrepareSend(toAddress, amount);
            } finally {
                setIsSending(false);
            }
        });

    const copyAddress = async () => {
        try {
            await navigator.clipboard.writeText(wallet.getAddress());

            setIsCopied(true);

            setTimeout(() => {
                setIsCopied(false);
            }, 3000);
        } catch (error) {
            console.error("Error copying text: ", error);
        }
    };

    return (
        <div className="wallet-card">
            <div className="wallet-card-index">
                {index === null ? "null" : index}
            </div>
            <div className="remove-block">
                <button onClick={() => removeWallet(wallet.getAddress())}>
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
            <div className="wallet-card-body">
                <div className="wallet-card-head">
                    <div className="wallet-card-name">{wallet.getName()}</div>
                </div>
                <div className="wallet-card-address">{address}</div>
                <div className="wallet-card-balance">
                    balance:{" "}
                    {isBalanceFetching
                        ? "loading balance ..."
                        : `${fromAtomicAmount(walletBalanceValue.walletBalance.totalBalance ?? 0n)} ASI`}
                </div>
                <ReservationStatus
                    address={address}
                    balance={walletBalanceValue.walletBalance.totalBalance}
                    isBalanceFetching={false} //INFO/TODO:
                    walletBalance={walletBalanceValue}
                />
                <div className="buttons">
                    <button
                        className="wallet-card-button"
                        onClick={() => handlePrepareSend()}
                        disabled={isSending || isBalanceFetching || !canSend}
                    >
                        Send
                    </button>
                    <button
                        className="wallet-card-button"
                        onClick={walletBalanceValue.updateReservationStatus}
                        disabled={isBalanceFetching || isSending}
                    >
                        Reload balance
                    </button>
                    <button
                        className="wallet-card-button"
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

export default WalletCard;

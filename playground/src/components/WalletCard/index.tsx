import { useEffect, useState, type ReactElement } from "react";
import { useAppContext } from "@components/Application/context";
import { Modals } from "@components/Application/meta";
import {
    fromAtomicAmount,
    ChainService,
    isAddress,
    Address,
    Wallet,
} from "asi-wallet-sdk";
import "./style.css";

export interface IWalletCardProps {
    wallet: Wallet;
    removeWallet: (id: Address) => void;
    chainService: ChainService;
}

const WalletCard = ({
    wallet,
    removeWallet,
    chainService,
}: IWalletCardProps): ReactElement => {
    const { setModalState, withLoader } = useAppContext();

    const [isCopied, setIsCopied] = useState<boolean>(false);
    const [isSending, setIsSending] = useState<boolean>(false);
    const [isBalanceFetching, setIsBalanceFetching] = useState<boolean>(false);
    const [balance, setBalance] = useState<bigint>(BigInt(0));

    const index = wallet.getIndex();
    const address = wallet.getAddress();
    const canSend = balance > 0n;

    const fetchBalance = async () => {
        try {
            setIsBalanceFetching(true);
            const balance = await chainService.getASIBalance(address);

            setBalance(balance);
        } catch (error) {
            console.error(error);
        } finally {
            setIsBalanceFetching(false);
        }
    };

    const handlePrepareSend = (toAddress?, amount?) => {
        setModalState({
            type: Modals.TRANSFER_MODAL,
            props: {
                toAddress: toAddress ?? "",
                amount: amount ?? 0n,
                currentBalance: balance,
                commission: 0,
                onConfirm: handleSend,
                onClose: () => {
                    setModalState({ type: null });
                },
            },
        });
    };

    const handleSend = (toAddress, amount) => {
        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Unlock your wallet to send ASI",
                onSubmit: (password: string) =>
                    transfer(toAddress, amount, password),
                onClose: () => {
                    setModalState({ type: null });
                },
            },
        });
    };

    const transfer = (toAddress, amount, password) =>
        withLoader(async () => {
            try {
                if (!isAddress(toAddress)) {
                    throw new Error("Invalid 'toAddress' provided.");
                }

                console.log("Starting transfer...", { toAddress, amount });


                setIsSending(true);

                const data = await chainService.transfer(
                    address,
                    toAddress,
                    amount,
                    wallet,
                    () => Promise.resolve(password)
                );

                console.log("Transfer successful", data);
                // alert("Transfer successful!");

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

                await fetchBalance();
            } catch (error) {
                console.error(error);
                alert(
                    `${error?.message || "Transfer failed"}, aborting transfer.`
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

    useEffect(() => {
        fetchBalance();
    }, []);

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
                        : `${fromAtomicAmount(balance)} ASI`}
                </div>
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
                        onClick={fetchBalance}
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

import { useEffect, useState, type ReactElement } from "react";
import { useAppContext } from "@components/Application/context";
import { Modals } from "@components/Application/meta";
import { Wallet, ChainService } from "asi-wallet-sdk";
import "./style.css";

export interface IWalletCardProps {
    wallet: Wallet;
    chainService: ChainService;
}

const WalletCard = ({
    wallet,
    chainService,
}: IWalletCardProps): ReactElement => {
    const { setModalState} = useAppContext();

    const [isSending, setIsSending] = useState<boolean>(false);
    const [isBalanceFetching, setIsBalanceFetching] = useState<boolean>(false);
    const [balance, setBalance] = useState<BigInt>(BigInt(0));

    const index = wallet.getIndex();
    const address = wallet.getAddress();
    const isLocked = wallet.isWalletLocked();
    const canSend = Number(balance) > 0;

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

    const handlePrepareSend = () => {
        setModalState({
            type: Modals.TRANSFER_MODAL,
            props: {
                currentBalance: Number(balance),
                commission: 0,
                onConfirm: handleSend,
                onCancel: () => {
                    setModalState({ type: null });
                }
            }
        })
    };

    const handleSend = (toAddress, amount) => {
        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Unlock your wallet to send ASI",
                onSubmit: (password: string) => transfer(toAddress, amount, password),
                onCancel: () => {
                    setModalState({ type: null });
                }
            }
        });
    }

    const transfer = async (toAddress, amount, password) => {
        try {
            console.log("Starting transfer...", { toAddress, amount });

            wallet.unlock(password);

            setIsSending(true);

            const data = await chainService.transfer(address, toAddress, amount, wallet.getPrivateKey());

            console.log("Transfer successful", data);
            alert("Transfer successful!");
            await fetchBalance();

            setModalState({ type: null });
        } catch (error) {
            console.error(error);
            handlePrepareSend();
        } finally {
            setIsSending(false);
        }
    }

    useEffect(() => {
        fetchBalance();
    }, []);

    return (
        <div className="wallet-card">
            <div className="wallet-card-index">
                {index === null ? "null" : index}
            </div>
            <div className="wallet-card-body">
                <div className="wallet-card-head">
                    <div className="wallet-card-name">{wallet.getName()}</div>
                    <div className="wallet-card-state">
                        {isLocked ? "Locked" : "Unlocked"}
                    </div>
                </div>
                <div className="wallet-card-address">{address}</div>
                <div className="wallet-card-balance">
                    balance:{" "}
                    {isBalanceFetching
                        ? "loading balance ..."
                        : balance.toString()}
                </div>
                <div className="buttons">
                    <button
                        className="wallet-card-button"
                        onClick={handlePrepareSend}
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
                </div>
            </div>
        </div>
    );
};

export default WalletCard;

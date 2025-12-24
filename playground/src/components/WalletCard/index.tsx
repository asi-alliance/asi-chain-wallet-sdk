import { useEffect, useState, type ReactElement } from "react";
import { Wallet, ChainService } from "asi-wallet-sdk";
import "./style.css";

export interface IWalletCardProps {
    wallet: Wallet;
    chainService: ChainService;
}

const chainService = window["chainService"];

const WalletCard = ({ wallet, chainService }: IWalletCardProps): ReactElement => {
    const [isSending, setIsSending] = useState<boolean>(false);
    const [isBalanceFetching, setIsBalanceFetching] = useState<boolean>(false);
    const [balance, setBalance] = useState<BigInt>(BigInt(0));

    const index = wallet.getIndex();
    const address = wallet.getAddress();
    const isLocked = wallet.isWalletLocked();
    // const canSend = balance > BigInt(0);

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

    const handleSend = async () => {};

    useEffect(() => {
        fetchBalance();
    }, []);

    return (
        <div className="wallet-card">
            <div className="wallet-card-index">
                {index === null ? "null" : index}
            </div>
            <div className="wallet-card-body">
                <div className="wallet-card-state">
                    {isLocked ? "Encrypted" : "Decrypted"}
                </div>
                <div className="wallet-card-address">{address}</div>
                <div className="wallet-card-balance">
                    balance:{" "}
                    {isBalanceFetching ? "loading balance ..." : balance.toString()}
                </div>
                <div className="buttons">
                    <button
                        className="wallet-card-button"
                        onClick={handleSend}
                        disabled={false}
                    >
                        Send
                    </button>
                    <button
                        className="wallet-card-button"
                        onClick={fetchBalance}
                        disabled={isBalanceFetching}
                    >
                        Reload balance
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WalletCard;

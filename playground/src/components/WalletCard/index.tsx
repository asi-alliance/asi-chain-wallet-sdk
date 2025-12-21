import type { ReactElement } from "react";
import "./style.css";

export interface IWalletCardProps {
    index: number | null;
    address: string;
    balance: string | number;
    isLocked: boolean;
    onSend: (index: number) => void;
}

const WalletCard = ({
    index,
    address,
    balance,
    isLocked,
    onSend,
}: IWalletCardProps): ReactElement => {
    const canSend = index !== null && !isLocked;

    const handleSend = () => {
        if (index === null) return;
        onSend(index);
    };

    return (
        <div className="wallet-card">
            <div className="wallet-card-index">
                {index === null ? "null" : index}
            </div>
            <div className="wallet-card-body">
                <div className="wallet-card-address">address: {address}</div>
                <div className="wallet-card-balance">balance: {balance}</div>
                <div className="wallet-card-state">
                    isLocked: {isLocked ? "yes" : "no"}
                </div>
            </div>
            <button
                className="wallet-card-send"
                onClick={handleSend}
                disabled={!canSend}
            >
                Send
            </button>
        </div>
    );
};

export default WalletCard;

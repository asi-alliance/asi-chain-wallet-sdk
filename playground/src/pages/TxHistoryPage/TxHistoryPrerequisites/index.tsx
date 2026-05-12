import { useCallback, useEffect, useMemo, type ReactElement } from "react";

// import { useWallets } from "../../../sdk-react-kit/hooks/useWallets";
import SelectFilter from "@components/common/SelectFilter";
import {Wallet} from "asi-wallet-sdk";
import { useSdkContext } from "../../../sdk-react-kit";

interface TxHistoryPrerequisitesProps {
    account: Wallet | null;
    setAccount: (account: Wallet | null) => void;
}

export const TxHistoryPrerequisites = ({
    account,
    setAccount
}: TxHistoryPrerequisitesProps): ReactElement => {
    const {wallets, network} = useSdkContext();

    const accountOptions = useMemo(() => {
        return [{value: "", label: "Select wallet"}, ...wallets.flatWallets.map((wallet) => ({
            value: wallet.getAddress(),
            label: wallet.getName(),
        }))];
    }, [wallets.flatWallets]);
    const onSelectAccountChange = useCallback((accountAddress: string) => {
        const selectedWallet = wallets.flatWallets.find(
            (wallet) => wallet.getAddress() === accountAddress,
        );

        if (!selectedWallet) {
            setAccount(null);
            return;
        }

        // SDK Wallet is not the asi-chain-wallet Account from src/types/wallet.ts.
        // This keeps the History.tsx Account contract explicit until the real mapper exists.
        setAccount(selectedWallet);
    }, [wallets.flatWallets, setAccount]);
    return (
        <section className="section">
            <h2>TxHistoryPrerequisites</h2>
            <div>
                Select wallet:
                <SelectFilter
                    id="tx-history-prerequisites-account-select"
                    label=""
                    value={account?.getAddress()}
                    options={accountOptions}
                    onChange={onSelectAccountChange}
                />
                name:{account ? account.getName() : String(account)}
                {' '}
                address: {account ? account.getAddress() : String(account)}
            </div>
            <div>
                Network: {String(network.currentNetwork?.name)}
            </div>
        </section>
    );
};

import { useCallback, useMemo, type ReactElement } from "react";

// import { useWallets } from "../../../sdk-react-kit/hooks/useWallets";
import SelectFilter from "@components/common/SelectFilter";
import {Network, Wallet} from "asi-wallet-sdk";
import { useSdkContext } from "../../../sdk-react-kit";

interface TxHistoryPrerequisitesProps {
    account: Wallet | null;
    setAccount: (account: Wallet | null) => void;
    network: Network | null;
    setNetwork: (network: Network | null) => void;
}

export const TxHistoryPrerequisites = ({
    account,
    setAccount, 
    network,
    setNetwork
}: TxHistoryPrerequisitesProps): ReactElement => {
    // Network selector facade is not wired yet; keep the setter in the props contract.
    void setNetwork;

    const {flatWallets} = useSdkContext();
    console.log(flatWallets)

    const accountOptions = useMemo(() => {
        return [{value: "", label: "Select wallet"}, ...flatWallets.map((wallet) => ({
            value: wallet.getAddress(),
            label: wallet.getName(),
        }))];
    }, [flatWallets]);
    const onSelectAccountChange = useCallback((accountAddress: string) => {
        const selectedWallet = flatWallets.find(
            (wallet) => wallet.getAddress() === accountAddress,
        );

        if (!selectedWallet) {
            setAccount(null);
            return;
        }

        // SDK Wallet is not the asi-chain-wallet Account from src/types/wallet.ts.
        // This keeps the History.tsx Account contract explicit until the real mapper exists.
        setAccount(selectedWallet);
    }, [flatWallets, setAccount]);

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
                Network: {String(network)}
            </div>
        </section>
    );
};

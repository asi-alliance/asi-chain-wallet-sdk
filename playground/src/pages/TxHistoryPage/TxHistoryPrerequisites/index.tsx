import { useCallback, useMemo, type ReactElement } from "react";

import { useWallets } from "../../../sdk-react-kit/hooks/useWallets";
import SelectFilter from "@components/common/SelectFilter";

interface TxHistoryPrerequisitesProps {
    account: any | null;
    setAccount: (account: any | null) => void;
    network: any | null;
    setNetwork: (network: any | null) => void;
}

export const TxHistoryPrerequisites = ({
    account,
    setAccount, 
    network,
    setNetwork
}: TxHistoryPrerequisitesProps): ReactElement => {
    // Network selector facade is not wired yet; keep the setter in the props contract.
    void setNetwork;

    const {flatWallets} = useWallets();
    console.log(flatWallets)

    const accountOptions = useMemo(() => {
        return [{value: "", label: "Select account"}, ...flatWallets.map((wallet) => ({
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
        setAccount({
            id: selectedWallet.getAddress(),
            name: selectedWallet.getName(),
            address: selectedWallet.getAddress(),
            revAddress: selectedWallet.getAddress(),
        });
    }, [flatWallets, setAccount]);

    return (
        <section className="section">
            <h2>TxHistoryPrerequisites</h2>
            <div>
                Account: {account ? account.name : String(account)}
                <SelectFilter
                    id="tx-history-prerequisites-account-select"
                    label=""
                    value="testName"
                    options={accountOptions}
                    onChange={onSelectAccountChange}
                />
            </div>
            <div>
                Network: {String(network)}
            </div>
        </section>
    );
};

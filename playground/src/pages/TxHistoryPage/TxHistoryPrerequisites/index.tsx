import { useCallback, useMemo, type ReactElement } from "react";
import type { TxHistoryAccount } from "../fixtures/txHistory.fixture";
import { useWallets } from "../../../sdk-react-kit/hooks/useWallets";
import SelectFilter from "@components/common/SelectFilter";

interface TxHistoryPrerequisitesProps {
    account: TxHistoryAccount | null;
    setAccount: (account: TxHistoryAccount | null) => void;
    network: any | null;
    setNetwork: (network: any | null) => void;
}

export const TxHistoryPrerequisites = ({
    account,
    setAccount, 
    network,
    setNetwork
}: TxHistoryPrerequisitesProps): ReactElement => {
    const {flatWallets} = useWallets();
    console.log(flatWallets)

    const accountOptions = useMemo(() => {
        return [{value: "", label: "Select account"}, ...flatWallets.map((wallet) => ({
            value: wallet.getAddress(),
            label: wallet.getName(),
        }))];
    }, [flatWallets]);
    const onSelectAccountChange = useCallback((accountAddress: string) => {
        setAccount(flatWallets.find(wallet => wallet.getAddress() === accountAddress));
    }, []);

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

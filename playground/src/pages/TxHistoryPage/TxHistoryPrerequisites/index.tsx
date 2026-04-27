import type { ReactElement } from "react";
import type { TxHistoryAccount } from "../fixtures/txHistory.fixture";

interface TxHistoryPrerequisitesProps {
    selectedAccount: TxHistoryAccount | null;
}

export const TxHistoryPrerequisites = ({
    selectedAccount,
}: TxHistoryPrerequisitesProps): ReactElement => {
    return (
        <section className="section">
            <h2>Prerequisites</h2>
            Select account:
            <span>
                {selectedAccount ? selectedAccount.name : "No account selected"}
            </span>
        </section>
    );
};

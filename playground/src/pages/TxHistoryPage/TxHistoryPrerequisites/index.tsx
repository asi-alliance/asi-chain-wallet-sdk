import { ReactElement } from "react";

export interface TxHistoryPrerequisitesValues {
  
}

interface TxHistoryPrerequisitesProps {
  onChange: (prerequisites: TxHistoryPrerequisitesValues) => void;
}
export const TxHistoryPrerequisites = ({} : TxHistoryPrerequisitesProps): ReactElement => {
  return (
    <section>
      <h2>
        Prerequisites
      </h2>
      <span>({selectedAccount.name})</span>
    </section>
  );
}
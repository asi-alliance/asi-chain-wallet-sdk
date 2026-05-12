import { Transaction } from "asi-wallet-sdk";

export function txHistoryCallbacks(txHistorySetters) {
    return {
        onLocalTxHistoryChanged(allLocalTxs: Transaction[]) {
            // const localRequestTxs =//TODO: move back to txHistorySlice
            // txHistorySetters.setLocalTransactions(localRequestTxs);

            txHistorySetters.setAllLocalTxs(allLocalTxs);
        }
    }   
}
import { useMemo } from "react";
import { walletsCallbacks } from "./callbacksBuilders/walletsCallbacks";
import { txHistoryCallbacks } from "./callbacksBuilders/txHistoryCallbacks";
import { networkCallbacks } from "./callbacksBuilders/networkCallbacks";
import { IUiEventDispatcher } from "asi-wallet-sdk";

export const useUiEventDispatcher = (walletsSetters, txHistorySetters, networkSetters): IUiEventDispatcher => {
return useMemo(() => {
    return {
        ...walletsCallbacks(walletsSetters),
        ...txHistoryCallbacks(txHistorySetters),
        ...networkCallbacks(networkSetters),
    }
}, []);
}



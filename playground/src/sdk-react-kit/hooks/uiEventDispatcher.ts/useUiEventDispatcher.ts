import { useMemo } from "react";
import { walletsCallbacks } from "./callbacksBuilders/walletsCallbacks";
import { txHistoryCallbacks } from "./callbacksBuilders/txHistoryCallbacks";
import { networkCallbacks } from "./callbacksBuilders/networkCallbacks";
import { IUiEventDispatcher } from "asi-wallet-sdk";
import { reservationsCallbacks } from "./callbacksBuilders/reservationsCallbacks";

export const useUiEventDispatcher = (walletsSetters, txHistorySetters, networkSetters, reservationSetters): IUiEventDispatcher => {
return useMemo(() => {
    return {
        ...walletsCallbacks(walletsSetters),
        ...txHistoryCallbacks(txHistorySetters),
        ...networkCallbacks(networkSetters),
        ...reservationsCallbacks(reservationSetters),
    }
}, []);
}



import { useMemo } from "react";
import {
    DEFAULT_ASSET,
    getNativeAsset,
    type Asset,
    type INetworkRecord,
} from "asi-wallet-sdk";

export const useNativeAsset = (currentNetwork: INetworkRecord | null): Asset =>
    useMemo(
        () =>
            currentNetwork
                ? getNativeAsset(currentNetwork.config)
                : DEFAULT_ASSET,
        [currentNetwork],
    );

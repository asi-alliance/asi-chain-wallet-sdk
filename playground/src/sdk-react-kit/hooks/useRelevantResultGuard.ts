import { useCallback, useEffect, useRef } from "react";
import type { NetworkId } from "asi-wallet-sdk";

export type TIsResultRelevant = () => boolean;

export type TStartRequest = () => TIsResultRelevant;

export const useRelevantResultGuard = (
    networkId?: NetworkId,
): TStartRequest => {
    const lastRequestIdRef = useRef<number>(0);
    const networkIdRef = useRef<NetworkId | undefined>(networkId);

    useEffect(() => {
        networkIdRef.current = networkId;
    }, [networkId]);

    return useCallback((): TIsResultRelevant => {
        const requestId: number = ++lastRequestIdRef.current;
        const requestNetworkId: NetworkId | undefined = networkIdRef.current;

        return () =>
            requestId === lastRequestIdRef.current &&
            requestNetworkId === networkIdRef.current;
    }, []);
};
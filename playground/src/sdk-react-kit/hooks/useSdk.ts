import { useCallback, useEffect, useRef, useState } from "react";
import { Client } from "asi-wallet-sdk";
import { init } from "../helpers";
import { walletsSlice } from "./walletsSlice";
import { txHistorySlice } from "./txHistorySlice";
import { networkSlice } from "./networkSlice";
import { useUiEventDispatcher } from "./uiEventDispatcher.ts/useUiEventDispatcher";
import { reservationSlice } from "./reservationSlice";

interface IPasswordSubmitHandler {
    (password: string): (void | Promise<void>);
}

type UseSdkParams = {
    onUnlockRequired?: (unlockVault: IPasswordSubmitHandler) => void;
    onVaultPasswordRequired?: (
        createVaultPassword: IPasswordSubmitHandler,
    ) => void;
    onInitError?: (error: unknown) => void;
};

const useSdk = ({
    onUnlockRequired,
    onVaultPasswordRequired,
    onInitError,
}: UseSdkParams) => {
    const [sdkClient, setSdkClient] = useState<Client>(null);
    const [currentPassword, setCurrentPassword] = useState<string>("");
    const callbacksRef = useRef({
        onUnlockRequired,
        onVaultPasswordRequired,
        onInitError,
    });

    const network = networkSlice(sdkClient);
    const wallets = walletsSlice(sdkClient);
    const txHistory = txHistorySlice(sdkClient, currentPassword, network);
    const reservation = reservationSlice(sdkClient, txHistory.transactions);

    // ///////
    const uiEventDispatcher = useUiEventDispatcher(wallets.walletsSetters, txHistory.txHistorySetters, network.networkSetters);
    // ///////

    useEffect(() => {
        callbacksRef.current = {
            onUnlockRequired,
            onVaultPasswordRequired,
            onInitError,
        };
    }, [onUnlockRequired, onVaultPasswordRequired, onInitError]);

    const saveVault = async (password: string) => {
        // if (!vault) return;

        try {
            console.time("lock");
            await sdkClient.vault.lock(password);
            console.timeEnd("lock");

            console.time("save");
            sdkClient.vault.save();
            console.timeEnd("save");

            console.time("unlock");
            await sdkClient.vault.unlock(password);
            console.timeEnd("unlock");

        } catch (error) {
            console.error(error);
            console.timeEnd("lock");
            console.timeEnd("save");
            console.timeEnd("unlock");
            throw error;
        }
    };

    const unlockVault = async (password: string) => {
        if (!sdkClient.vault) return;

        await sdkClient.vault.unlock(password);
        setCurrentPassword(password);
    };

    const createVaultPassword = async (password: string) => {
        await saveVault(password);
        setCurrentPassword(password);
    };

    useEffect(() => {
        const initialize = async () => {
            try {
                const sdkClient = await init(uiEventDispatcher);
                setSdkClient(sdkClient);
                if(sdkClient.vault.isExist()) {
                    
                    onUnlockRequired(async (password) => {             
                        setCurrentPassword(password);
                        sdkClient.vaultsPassword=password;
                        await sdkClient.onFirstUnlock();
                        await sdkClient.vault.unlock(password);
                        
                    });
                } else {
                    onVaultPasswordRequired(async (password) => {
                        setCurrentPassword(password);
                        sdkClient.vaultsPassword=password;
                        await sdkClient.onFirstUnlock();
                        await sdkClient.vault.unlock(password);
                    })
                }
            } catch (error) {
                console.error(error);
                callbacksRef.current.onInitError?.(error);
            }
        }
        initialize();
    }, []);

    const clearSdkData = useCallback(() => {
        sdkClient?.clearPersistance();
    }, [sdkClient]);

    return {
        sdkClient,
        currentPassword,
        saveVault,
        unlockVault,
        createVaultPassword,
        clearSdkData,
        network,
        wallets,
        txHistory,
        reservation,
    };
};

export type { IPasswordSubmitHandler };
export type UseSdkValue = ReturnType<typeof useSdk>;
export { useSdk };

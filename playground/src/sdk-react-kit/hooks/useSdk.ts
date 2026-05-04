import { useCallback, useEffect, useRef, useState } from "react";
import { Client } from "asi-wallet-sdk";
import { init, type NetworkConfig } from "../helpers";
import { useWallets } from "./useWallets";
import { useTxHistory } from "./useTxHistory";

interface IPasswordSubmitHandler {
    (password: string): (void | Promise<void>);
}

type UseSdkParams = {
    config: NetworkConfig;
    onUnlockRequired?: (unlockVault: IPasswordSubmitHandler) => void;
    onVaultPasswordRequired?: (
        createVaultPassword: IPasswordSubmitHandler,
    ) => void;
    onInitError?: (error: unknown) => void;
};

const useSdk = ({
    config,
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

    const reactiveWallets = useWallets(sdkClient);
    console.log("reactiveWallets=", reactiveWallets);
    const txHistory = useTxHistory(sdkClient, currentPassword);
    console.log("txHistory=", txHistory);

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
                const sdkClient = await init(config);
                setSdkClient(sdkClient);
                if(sdkClient.vault.isExist()) {
                    onUnlockRequired(async (password) => {
                        await sdkClient.vault.unlock(password);
                        sdkClient.vaultsPassword=password;
                        setCurrentPassword(password);
                        await sdkClient.uiEventDispatcher.onVaultChanged?.();
                    });
                } else {
                    onVaultPasswordRequired(async (password) => {
                        console.log("onVaultPasswordRequired: start")
                        await sdkClient.vault.unlock(password);
                        sdkClient.vaultsPassword=password;
                        setCurrentPassword(password);
                    })
                }
            } catch (error) {
                callbacksRef.current.onInitError?.(error);
            }
        }
        initialize();
    }, [config]);

    const clearSdkData = useCallback(() => {
        sdkClient?.vault.clearSavedVault();
    }, [sdkClient]);

    return {
        sdkClient,
        currentPassword,
        saveVault,
        unlockVault,
        createVaultPassword,
        clearSdkData,
        ...reactiveWallets,
        txHistory,
    };
};

export type { IPasswordSubmitHandler };
export type UseSdkValue = ReturnType<typeof useSdk>;
export { useSdk };

import { useCallback, useEffect, useRef, useState } from "react";
import { AssetsService, Client, WebVault } from "asi-wallet-sdk";
import { init, type NetworkConfig } from "../helpers";
import { useWallets } from "./useWallets";

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

const cloneVault = (vault: WebVault) =>
    Object.assign(Object.create(Object.getPrototypeOf(vault)), vault);

const useSdk = ({
    config,
    onUnlockRequired,
    onVaultPasswordRequired,
    onInitError,
}: UseSdkParams) => {
    const [sdkClient, setSdkClient] = useState<Client>(null);
    const [isVaultConfigured, setIsVaultConfigured] =
        useState<boolean>(false);
    // const [assetsService, setAssetsService] = useState<AssetsService | null>(
        // null,
    // );
    const [currentPassword, setCurrentPassword] = useState<string>("");
    const callbacksRef = useRef({
        onUnlockRequired,
        onVaultPasswordRequired,
        onInitError,
    });

    const reactiveWallets = useWallets(sdkClient);
    console.log("reactiveWallets=", reactiveWallets);

    useEffect(() => {
        callbacksRef.current = {
            onUnlockRequired,
            onVaultPasswordRequired,
            onInitError,
        };
    }, [onUnlockRequired, onVaultPasswordRequired, onInitError]);

    // const updateVault = (nextVault: WebVault) => {
    //     setVault(cloneVault(nextVault));
    // };

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

            // updateVault(sdkClient.vault);
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
        // updateVault(sdkClient.vault);
    };

    const createVaultPassword = async (password: string) => {
        await saveVault(password);
        setCurrentPassword(password);
        setIsVaultConfigured(true);
    };

    useEffect(() => {
        const initialize = async () => {
            try {
                const sdkClient = await init(config);
                setSdkClient(sdkClient);
                onUnlockRequired((password) => {
                    sdkClient.vault.unlock(password);
                })
            } catch (error) {
                callbacksRef.current.onInitError?.(error);
            }
        }
        initialize();
    }, [config]);

    // useEffect(() => {
    //     if (sdkClient?.vault && sdkClient?.vault.isEmpty() && !isVaultConfigured) {
    //         callbacksRef.current.onVaultPasswordRequired?.(
    //             createVaultPassword,
    //         );
    //     }
    // }, [sdkClient, isVaultConfigured]);

    const clearSdkData = useCallback(() => {
        sdkClient?.vault.clearSavedVault();
    }, [sdkClient]);

    return {
        sdkClient,
        // assetsService,
        currentPassword,
        saveVault,
        unlockVault,
        createVaultPassword,
        clearSdkData,
        ...reactiveWallets,
    };
};

export type { IPasswordSubmitHandler };
export type UseSdkValue = ReturnType<typeof useSdk>;
export { useSdk };

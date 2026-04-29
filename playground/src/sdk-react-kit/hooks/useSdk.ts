import { useCallback, useEffect, useRef, useState } from "react";
import { AssetsService, Vault } from "asi-wallet-sdk";
import { init, type NetworkConfig } from "../helpers";

interface IPasswordSubmitHandler {
    (password: string): Promise<void>;
}

type UseSdkParams = {
    config: NetworkConfig;
    onUnlockRequired?: (unlockVault: IPasswordSubmitHandler) => void;
    onVaultPasswordRequired?: (
        createVaultPassword: IPasswordSubmitHandler,
    ) => void;
    onInitError?: (error: unknown) => void;
};

const cloneVault = (vault: Vault) =>
    Object.assign(Object.create(Object.getPrototypeOf(vault)), vault);

const useSdk = ({
    config,
    onUnlockRequired,
    onVaultPasswordRequired,
    onInitError,
}: UseSdkParams) => {
    const [vault, setVault] = useState<Vault | null>(null);
    const [isVaultConfigured, setIsVaultConfigured] =
        useState<boolean>(false);
    const [assetsService, setAssetsService] = useState<AssetsService | null>(
        null,
    );
    const [currentPassword, setCurrentPassword] = useState<string>("");
    const callbacksRef = useRef({
        onUnlockRequired,
        onVaultPasswordRequired,
        onInitError,
    });

    useEffect(() => {
        callbacksRef.current = {
            onUnlockRequired,
            onVaultPasswordRequired,
            onInitError,
        };
    }, [onUnlockRequired, onVaultPasswordRequired, onInitError]);

    const updateVault = (nextVault: Vault) => {
        setVault(cloneVault(nextVault));
    };

    const saveVault = async (password: string) => {
        if (!vault) return;

        try {
            console.time("lock");
            await vault.lock(password);
            console.timeEnd("lock");

            console.time("save");
            vault.save();
            console.timeEnd("save");

            console.time("unlock");
            await vault.unlock(password);
            console.timeEnd("unlock");

            updateVault(vault);
        } catch (error) {
            console.error(error);
            console.timeEnd("lock");
            console.timeEnd("save");
            console.timeEnd("unlock");
            throw error;
        }
    };

    const unlockVault = async (password: string) => {
        if (!vault) return;

        await vault.unlock(password);
        setCurrentPassword(password);
        updateVault(vault);
    };

    const createVaultPassword = async (password: string) => {
        await saveVault(password);
        setCurrentPassword(password);
        setIsVaultConfigured(true);
    };

    useEffect(() => {
        try {
            const { vault: initialVault, assetsService: initialAssetsService } =
                init(config);

            setVault(initialVault);
            setAssetsService(initialAssetsService);
        } catch (error) {
            callbacksRef.current.onInitError?.(error);
        }
    }, [config]);

    useEffect(() => {
        if (vault && vault.isVaultLocked()) {
            setIsVaultConfigured(true);
            callbacksRef.current.onUnlockRequired?.(unlockVault);
            return;
        }

        if (vault && vault.isEmpty() && !isVaultConfigured) {
            callbacksRef.current.onVaultPasswordRequired?.(
                createVaultPassword,
            );
        }
    }, [vault, isVaultConfigured]);

    const clearSdkData = useCallback(() => {
        vault.clearSavedVault();
    }, [vault]);

    return {
        vault,
        assetsService,
        currentPassword,
        saveVault,
        unlockVault,
        createVaultPassword,
        clearSdkData
    };
};

export type { IPasswordSubmitHandler };
export type UseSdkValue = ReturnType<typeof useSdk>;
export { useSdk };

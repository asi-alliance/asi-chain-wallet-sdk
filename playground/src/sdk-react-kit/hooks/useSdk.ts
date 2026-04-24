import { useEffect, useRef, useState } from "react";
import { AssetsService, Vault } from "asi-wallet-sdk";
import { init, type NetworkConfig } from "../helpers";

type PasswordSubmitHandler = (password: string) => Promise<void>;

type UseSdkParams = {
    config: NetworkConfig;
    vaultStorageKey: string;
    onUnlockRequired?: (unlockVault: PasswordSubmitHandler) => void;
    onVaultPasswordRequired?: (
        createVaultPassword: PasswordSubmitHandler,
    ) => void;
    onInitError?: (error: unknown) => void;
};

const cloneVault = (vault: Vault) =>
    Object.assign(Object.create(Object.getPrototypeOf(vault)), vault);

const useSdk = ({
    config,
    vaultStorageKey,
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
            vault.save(vaultStorageKey);
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
                init(config, vaultStorageKey);

            setVault(initialVault);
            setAssetsService(initialAssetsService);
        } catch (error) {
            callbacksRef.current.onInitError?.(error);
        }
    }, [config, vaultStorageKey]);

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

    return {
        vault,
        assetsService,
        currentPassword,
        saveVault,
        unlockVault,
        createVaultPassword,
    };
};

export type UseSdkValue = ReturnType<typeof useSdk>;
export { useSdk };

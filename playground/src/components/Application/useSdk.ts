import { useEffect, useState } from "react";
import { AssetsService, Vault } from "asi-wallet-sdk";
import type { ApplicationContextValue, ModalState } from "./context";
import { init, Modals } from "./meta";

const VAULT_STORAGE_KEY = "test_vault";

const configs = import.meta.env.VITE_NETWORKS;
const config = JSON.parse(configs)["DevNet"];

if (!config) {
    throw new Error("Network configuration (env) not found");
}

type UseSdkParams = {
    setModalState: ApplicationContextValue["setModalState"];
    withLoader: ApplicationContextValue["withLoader"];
};

const cloneVault = (vault: Vault) =>
    Object.assign(Object.create(Object.getPrototypeOf(vault)), vault);

const useSdk = ({ setModalState, withLoader }: UseSdkParams) => {
    const [vault, setVault] = useState<Vault | null>(null);
    const [isVaultConfigured, setIsVaultConfigured] =
        useState<boolean>(false);
    const [assetsService, setAssetsService] = useState<AssetsService | null>(
        null,
    );
    const [currentPassword, setCurrentPassword] = useState<string>("");

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
            vault.save(VAULT_STORAGE_KEY);
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
        }
    };

    const unlockVault = (password: string) =>
        withLoader(async () => {
            try {
                await vault?.unlock(password);
                setCurrentPassword(password);

                if (vault) {
                    updateVault(vault);
                }

                setModalState({ type: null });
            } catch {
                alert(
                    "Failed to unlock vault. Please check your password and try again.",
                );
            }
        });

    const createPassword = (password: string) =>
        withLoader(async () => {
            await saveVault(password);
            setCurrentPassword(password);
            setIsVaultConfigured(true);
            setModalState({ type: null });
        });

    const openUnlockModal = () => {
        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Unlock Vault",
                onSubmit: unlockVault,
            },
        } satisfies ModalState);
    };

    const openCreatePasswordForVaultModal = () => {
        setModalState({
            type: Modals.PASSWORD_MODAL,
            props: {
                title: "Create Password for Vault",
                onSubmit: createPassword,
            },
        } satisfies ModalState);
    };

    useEffect(() => {
        withLoader(() => init(config, setVault, setAssetsService));
    }, []);

    useEffect(() => {
        if (vault && vault.isVaultLocked()) {
            setIsVaultConfigured(true);
            openUnlockModal();
            return;
        }

        if (vault && vault.isEmpty() && !isVaultConfigured) {
            openCreatePasswordForVaultModal();
        }
    }, [vault, isVaultConfigured]);

    return {
        vault,
        assetsService,
        currentPassword,
        saveVault,
    };
};

export type UseSdkValue = ReturnType<typeof useSdk>;
export default useSdk;

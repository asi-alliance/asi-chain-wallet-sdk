import { useCallback } from "react";
import { WalletLockedError } from "asi-wallet-sdk";
import { useSdkContext } from "../sdk-react-kit";
import { useAppContext } from "@components/Application/context";
import { Modals } from "@components/Application/meta";

interface ISecureActionOptions<T> {
    walletId: string;
    passwordTitle: string;
    confirmMessage: string;
    action: (password?: string) => Promise<T>;
}

const useSecureAction = () => {
    const { isWalletUnlocked } = useSdkContext();
    const { setModalState } = useAppContext();

    const promptPassword = useCallback(
        (title: string): Promise<string | null> =>
            new Promise((resolve) => {
                setModalState({
                    type: Modals.PASSWORD_MODAL,
                    props: {
                        title,
                        onSubmit: (password: string) => {
                            setModalState({ type: null });
                            resolve(password);
                        },
                        onClose: () => {
                            setModalState({ type: null });
                            resolve(null);
                        },
                    },
                });
            }),
        [setModalState],
    );

    return useCallback(
        async <T>({
            walletId,
            passwordTitle,
            confirmMessage,
            action,
        }: ISecureActionOptions<T>): Promise<T | undefined> => {
            if (isWalletUnlocked(walletId)) {
                if (!window.confirm(confirmMessage)) {
                    return undefined;
                }

                try {
                    return await action();
                } catch (error) {
                    if (!(error instanceof WalletLockedError)) {
                        throw error;
                    }
                }
            }

            const password: string | null = await promptPassword(passwordTitle);

            if (password === null) {
                return undefined;
            }

            return action(password);
        },
        [isWalletUnlocked, promptPassword],
    );
};

export default useSecureAction;

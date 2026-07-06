import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Client,
    IClientEventDispatcher,
    ICreatedAccountData,
    ITransactionReservation,
    ITransferRequest,
    IWalletMetadata,
    MnemonicStrength,
    NetworkName,
    Wallet,
} from "asi-wallet-sdk";
import { init } from "../helpers";

export interface ICreateHDWalletInput {
    name: string;
    mnemonic: string;
}

export interface ICreatePkWalletInput {
    name: string;
    privateKey: Uint8Array;
}

const useSdk = () => {
    const [client, setClient] = useState<Client | null>(null);
    const [walletsMetadata, setWalletsMetadata] = useState<IWalletMetadata[]>(
        [],
    );
    const [unlockedWallets, setUnlockedWallets] = useState<Wallet[]>([]);
    const [networks, setNetworks] = useState<NetworkName[]>([]);
    const [currentNetwork, setCurrentNetwork] = useState<NetworkName | null>(
        null,
    );
    const [reservationsByWallet, setReservationsByWallet] = useState<
        Record<string, ITransactionReservation[]>
    >({});

    const clientRef = useRef<Client | null>(null);

    const refresh = useCallback(
        async (activeClient?: Client): Promise<void> => {
            const currentClient = activeClient ?? clientRef.current;

            if (!currentClient) {
                return;
            }

            const walletManager = currentClient.getWalletManager();

            setWalletsMetadata(await walletManager.getPublicWalletsMetadata());
            setUnlockedWallets([...walletManager.getAll()]);
        },
        [],
    );

    const eventDispatcher = useMemo<IClientEventDispatcher>(
        () => ({
            onWalletsChanged: () => {
                void refresh();
            },
            onAccountsChanged: () => {
                void refresh();
            },
            onNetworkChanged: (networkName: NetworkName) => {
                setCurrentNetwork(networkName);
            },
            onReservationsChanged: (
                walletId: string,
                reservations: ITransactionReservation[],
            ) => {
                setReservationsByWallet((previous) => ({
                    ...previous,
                    [walletId]: reservations,
                }));
            },
        }),
        [refresh],
    );

    useEffect(() => {
        let disposed = false;

        const initialize = async (): Promise<void> => {
            const createdClient = await init(eventDispatcher);

            if (disposed) {
                createdClient.close();

                return;
            }

            clientRef.current = createdClient;
            setClient(createdClient);
            setNetworks(createdClient.getNetworksNames());
            setCurrentNetwork(createdClient.getCurrentNetwork());

            await refresh(createdClient);
        };

        initialize();

        return () => {
            disposed = true;
            clientRef.current?.close();
            clientRef.current = null;
        };
    }, [eventDispatcher, refresh]);

    const requireClient = useCallback((): Client => {
        if (!clientRef.current) {
            throw new Error("SDK client is not ready yet");
        }

        return clientRef.current;
    }, []);

    const generateMnemonic = useCallback(
        (strength?: MnemonicStrength): string =>
            requireClient().generateMnemonic(strength),
        [requireClient],
    );

    const generatePrivateKey = useCallback(
        (): Uint8Array => requireClient().generatePrivateKey(),
        [requireClient],
    );

    const createHDWallet = useCallback(
        async (
            input: ICreateHDWalletInput,
            password: string,
        ): Promise<Wallet> => {
            const wallet = await requireClient().createHDWallet(
                { mnemonic: input.mnemonic, accountName: input.name },
                password,
            );

            await refresh();

            return wallet;
        },
        [requireClient, refresh],
    );

    const createPrivateKeyWallet = useCallback(
        async (
            input: ICreatePkWalletInput,
            password: string,
        ): Promise<Wallet> => {
            const wallet = await requireClient().createPrivateKeyWallet(
                { privateKey: input.privateKey, accountName: input.name },
                password,
            );

            await refresh();

            return wallet;
        },
        [requireClient, refresh],
    );

    const unlockWallet = useCallback(
        async (signerId: string, password: string): Promise<Wallet> => {
            const wallet = await requireClient().unlockWallet(
                signerId,
                password,
            );

            await refresh();

            return wallet;
        },
        [requireClient, refresh],
    );

    const removeWallet = useCallback(
        async (walletId: string): Promise<void> => {
            await requireClient().removeWallet(walletId);

            await refresh();
        },
        [requireClient, refresh],
    );

    const deriveAccount = useCallback(
        async (
            walletId: string,
            name: string,
            password: string,
        ): Promise<ICreatedAccountData> => {
            const result = await requireClient().deriveAccount(
                walletId,
                name,
                password,
            );

            await refresh();

            return result;
        },
        [requireClient, refresh],
    );

    const renameAccount = useCallback(
        async (
            walletId: string,
            accountId: string,
            name: string,
        ): Promise<void> => {
            await requireClient().renameAccount(walletId, accountId, name);

            await refresh();
        },
        [requireClient, refresh],
    );

    const removeAccount = useCallback(
        async (walletId: string, accountId: string): Promise<void> => {
            await requireClient().removeAccount(walletId, accountId);

            await refresh();
        },
        [requireClient, refresh],
    );

    const setActiveAccount = useCallback(
        (walletId: string, accountId: string): void => {
            requireClient().setActiveAccount(walletId, accountId);

            void refresh();
        },
        [requireClient, refresh],
    );

    const setNetwork = useCallback(
        (networkName: NetworkName): void => {
            const currentClient = requireClient();

            currentClient.setNetwork(networkName);

            setCurrentNetwork(currentClient.getCurrentNetwork());
        },
        [requireClient],
    );

    const transfer = useCallback(
        (request: ITransferRequest, password: string): Promise<string> =>
            requireClient().transfer(request, password),
        [requireClient],
    );

    const getBalance = useCallback(
        (address: string): Promise<bigint> =>
            requireClient().getBalance(address as never),
        [requireClient],
    );

    const getAvailableBalance = useCallback(
        (walletId: string, accountId: string): Promise<bigint> =>
            requireClient().getAvailableBalance(walletId, accountId),
        [requireClient],
    );

    const getReservations = useCallback(
        (walletId: string): Promise<ITransactionReservation[]> =>
            requireClient().getReservations(walletId),
        [requireClient],
    );

    const clearPersistence = useCallback(async (): Promise<void> => {
        await requireClient().clearPersistence();

        await refresh();
    }, [requireClient, refresh]);

    const toDisplayAmount = useCallback(
        (atomicAmount: bigint): string =>
            requireClient().toDisplayAmount(atomicAmount),
        [requireClient],
    );

    const toAtomicAmount = useCallback(
        (amount: string | number): bigint =>
            requireClient().toAtomicAmount(amount),
        [requireClient],
    );

    return {
        client,
        isReady: client !== null,
        walletsMetadata,
        unlockedWallets,
        reservationsByWallet,
        networks,
        currentNetwork,
        setNetwork,
        generateMnemonic,
        generatePrivateKey,
        createHDWallet,
        createPrivateKeyWallet,
        unlockWallet,
        removeWallet,
        deriveAccount,
        renameAccount,
        removeAccount,
        setActiveAccount,
        transfer,
        getBalance,
        getAvailableBalance,
        getReservations,
        clearPersistence,
        toDisplayAmount,
        toAtomicAmount,
    };
};

export type UseSdkValue = ReturnType<typeof useSdk>;
export { useSdk };

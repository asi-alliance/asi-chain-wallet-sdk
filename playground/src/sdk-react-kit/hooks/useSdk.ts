import { useCallback, useEffect, useRef, useState } from "react";
import {
  Client,
  ClientEvent,
  ICreatedAccountData,
  IDeployRequest,
  IDeployWatchCallbacks,
  IDeployWatchHandle,
  IDeployWatchOptions,
  IImportWalletKeyfileOptions,
  IKeyfileImportPreview,
  IKeyfileImportResult,
  INetworkConfig,
  INetworkRecord,
  INetworkUpdate,
  IReservedOperationResult,
  ITransactionReservation,
  ITransferRequest,
  IWalletMetadata,
  MnemonicStrength,
  NetworkId,
  NetworkName,
  TReservationsByWallet,
  TUnsubscribe,
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
  const [walletsMetadata, setWalletsMetadata] = useState<IWalletMetadata[]>([]);
  const [unlockedWallets, setUnlockedWallets] = useState<Wallet[]>([]);
  const [networkRecords, setNetworkRecords] = useState<INetworkRecord[]>([]);
  const [currentNetwork, setCurrentNetwork] = useState<INetworkRecord | null>(
    null,
  );
  const [reservationsByWallet, setReservationsByWallet] =
    useState<TReservationsByWallet>({});
  const [busyNetworkIds, setBusyNetworkIds] = useState<NetworkId[]>([]);

  const clientRef = useRef<Client | null>(null);

  const refresh = useCallback(async (activeClient?: Client): Promise<void> => {
    const currentClient = activeClient ?? clientRef.current;

    if (!currentClient) {
      return;
    }

    const walletManager = currentClient.getWalletManager();

    setWalletsMetadata(await walletManager.getPublicWalletsMetadata());
    setUnlockedWallets([...walletManager.getAll()]);
  }, []);

  const refreshNetworks = useCallback((activeClient?: Client): void => {
    const currentClient = activeClient ?? clientRef.current;

    if (!currentClient) {
      return;
    }

    setNetworkRecords(currentClient.getNetworks());
  }, []);

  useEffect(() => {
    let disposed = false;

    const initialize = async (): Promise<void> => {
      const createdClient = await init();

      if (disposed) {
        createdClient.close();

        return;
      }

      clientRef.current = createdClient;
      setClient(createdClient);
      refreshNetworks(createdClient);
      setCurrentNetwork(createdClient.getCurrentNetwork());

      await refresh(createdClient);
    };

    initialize();

    return () => {
      disposed = true;
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, [refresh, refreshNetworks]);

  useEffect(() => {
    if (!client) {
      return;
    }

    const eventBus = client.getEventBus();

    const unsubscribes: TUnsubscribe[] = [
      eventBus.on(ClientEvent.WALLETS_CHANGED, () => {
        void refresh();
      }),
      eventBus.on(ClientEvent.ACCOUNTS_CHANGED, () => {
        void refresh();
      }),
      eventBus.on(ClientEvent.NETWORK_CHANGED, (network: INetworkRecord) => {
        setCurrentNetwork(network);
      }),
      eventBus.on(
        ClientEvent.RESERVATIONS_CHANGED,
        (reservationsByWallet: TReservationsByWallet) => {
          setReservationsByWallet(reservationsByWallet);
        },
      ),
      eventBus.on(
        ClientEvent.NETWORK_BUSY_CHANGED,
        (networkId: NetworkId, isBusy: boolean) => {
          setBusyNetworkIds((currentIds: NetworkId[]) => {
            const restIds: NetworkId[] = currentIds.filter(
              (id: NetworkId) => id !== networkId,
            );

            return isBusy ? [...restIds, networkId] : restIds;
          });
        },
      ),
    ];

    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [client, refresh]);

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
    async (input: ICreateHDWalletInput, password: string): Promise<Wallet> => {
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
    async (input: ICreatePkWalletInput, password: string): Promise<Wallet> => {
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
      const wallet = await requireClient().unlockWallet(signerId, password);

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
    (networkId: NetworkId): void => {
      const currentClient = requireClient();

      currentClient.setNetwork(networkId);

      setCurrentNetwork(currentClient.getCurrentNetwork());
    },
    [requireClient],
  );

  const addNetwork = useCallback(
    async (
      name: NetworkName,
      config: INetworkConfig,
    ): Promise<INetworkRecord> => {
      const record = await requireClient().addNetwork(name, config);

      refreshNetworks();

      return record;
    },
    [requireClient, refreshNetworks],
  );

  const updateNetwork = useCallback(
    async (networkId: NetworkId, update: INetworkUpdate): Promise<void> => {
      const currentClient = requireClient();

      await currentClient.updateNetwork(networkId, update);

      refreshNetworks();
      setCurrentNetwork(currentClient.getCurrentNetwork());
    },
    [requireClient, refreshNetworks],
  );

  const removeNetwork = useCallback(
    async (networkId: NetworkId): Promise<void> => {
      const currentClient = requireClient();

      await currentClient.removeNetwork(networkId);

      refreshNetworks();
      setCurrentNetwork(currentClient.getCurrentNetwork());
    },
    [requireClient, refreshNetworks],
  );

  const transfer = useCallback(
    (
      request: ITransferRequest,
      password?: string,
    ): Promise<IReservedOperationResult> =>
      requireClient().transfer(request, password),
    [requireClient],
  );

  const deploy = useCallback(
    (
      request: IDeployRequest,
      password?: string,
    ): Promise<IReservedOperationResult> =>
      requireClient().deploy(request, password),
    [requireClient],
  );

  const isWalletUnlocked = useCallback(
    (walletId: string): boolean => requireClient().isWalletUnlocked(walletId),
    [requireClient],
  );

  const exploreDeploy = useCallback(
    (rholang: string): Promise<unknown> =>
      requireClient().exploreDeploy(rholang),
    [requireClient],
  );

  const watchDeploy = useCallback(
    (
      deployId: string,
      callbacks?: IDeployWatchCallbacks,
      options?: IDeployWatchOptions,
    ): IDeployWatchHandle =>
      requireClient().watchDeploy(deployId, callbacks, options),
    [requireClient],
  );

  const getExportedAccountData = useCallback(
    (walletId: string, accountId: string): string =>
      requireClient().getExportedAccountData(walletId, accountId),
    [requireClient],
  );

  const exportWalletKeyfile = useCallback(
    (walletId: string, password: string): Promise<string> =>
      requireClient().exportWalletKeyfile(walletId, password),
    [requireClient],
  );

  const previewWalletKeyfileImport = useCallback(
    (source: string, password: string): Promise<IKeyfileImportPreview> =>
      requireClient().previewWalletKeyfileImport(source, password),
    [requireClient],
  );

  const importWalletKeyfile = useCallback(
    async (
      source: string,
      password: string,
      options?: IImportWalletKeyfileOptions,
    ): Promise<IKeyfileImportResult> => {
      const result = await requireClient().importWalletKeyfile(
        source,
        password,
        options,
      );

      await refresh();

      return result;
    },
    [requireClient, refresh],
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

  const hasNetworkReservations = useCallback(
    (networkId?: NetworkId): boolean =>
      requireClient().hasNetworkReservations(networkId),
    [requireClient],
  );

  const isNetworkBusy = useCallback(
    (networkId: NetworkId): boolean => busyNetworkIds.includes(networkId),
    [busyNetworkIds],
  );

  const isCurrentNetworkBusy: boolean =
    currentNetwork !== null && busyNetworkIds.includes(currentNetwork.id);

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
    (amount: string | number): bigint => requireClient().toAtomicAmount(amount),
    [requireClient],
  );

  return {
    client,
    isReady: client !== null,
    walletsMetadata,
    unlockedWallets,
    reservationsByWallet,
    networkRecords,
    currentNetwork,
    setNetwork,
    addNetwork,
    updateNetwork,
    removeNetwork,
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
    deploy,
    isWalletUnlocked,
    exploreDeploy,
    watchDeploy,
    getExportedAccountData,
    exportWalletKeyfile,
    previewWalletKeyfileImport,
    importWalletKeyfile,
    getBalance,
    getAvailableBalance,
    getReservations,
    hasNetworkReservations,
    isNetworkBusy,
    isCurrentNetworkBusy,
    clearPersistence,
    toDisplayAmount,
    toAtomicAmount,
  };
};

export type UseSdkValue = ReturnType<typeof useSdk>;
export { useSdk };

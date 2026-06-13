import { Pagination } from "@services/GraphqlParser/queryOptions";
import { NetworkName } from "@domains/aggregates/Network";
import Wallet, { Address } from "@domains/Wallet";
import Vault from "@domains/Vault";
import { NetworkProvider } from "@services/NetworkProvider";
import { loadNetworksFromEnv } from "../../infrastructure/loadNetworksFromEnv";
import { IUiEventDispatcher } from "@domains/WebAuxiliaryVault/IUiEventDispatcher";
import FundsReservationService from "@services/FundsReservation";
import {
    TransactionFilter,
    TransactionsHistory,
} from "@services/TransactionsHistory";
import { IAuxiliaryVault } from "@domains/WebAuxiliaryVault/IAuxiliaryVault";
import { IFileSaver } from "@services/FileSaver";
import AssetsService from "@services/AssetsService";
import BlockchainGateway from "@domains/BlockchainGateway";
import {
    TPasswordProvider,
    TPasswordProviderWithPrivateKey,
} from "@domains/PasswordProvider";
import Seed from "@domains/Seed";
import MnemonicService from "@services/Mnemonic";
import StoreManager from "@services/StoreManager";

export interface ClientOptions {
    vault?: Vault;
    password?: string;
    uiEventDispatcher: IUiEventDispatcher;
    auxiliaryVault: IAuxiliaryVault;
    fileSaver?: IFileSaver;
}

export default class Client {
    private readonly _vault: Vault;

    private _auxiliaryVault: IAuxiliaryVault;
    private _fileSaver?: IFileSaver;
    private _vaultsPassword?: string;

    public assetsService: AssetsService;
    public transactionsHistory: TransactionsHistory;
    public uiEventDispatcher: IUiEventDispatcher;
    public networkProvider: NetworkProvider;
    public fundsReservation: FundsReservationService;

    private activeWalletAddress?: Address;

    private constructor(
        vault: Vault,
        uiEventDispatcher: IUiEventDispatcher,
        auxiliaryVault: IAuxiliaryVault,
        password?: string,
        fileSaver?: IFileSaver,
    ) {
        this._vault = vault;
        this._auxiliaryVault = auxiliaryVault;
        this._fileSaver = fileSaver;
        this._vaultsPassword = password;

        this.networkProvider = new NetworkProvider(loadNetworksFromEnv(), null);
        this.assetsService = new AssetsService();

        this.transactionsHistory = new TransactionsHistory(
            this._auxiliaryVault,
            this._fileSaver,
        );
        this.fundsReservation = new FundsReservationService(
            this.transactionsHistory,
        );
        this.uiEventDispatcher = uiEventDispatcher;

        this.uiEventDispatcher.onCurrentNetworkChanged?.(
            this.networkProvider.getCurrentNetwork(),
        );
        this.uiEventDispatcher.onNetworksChanged?.(
            this.networkProvider.networks,
        );
    }

    public get auxiliaryVault() {
        if (!this._auxiliaryVault) {
            throw new Error(
                "Client: To call this method, you need to provide auxiliaryVault when initializing the sdk",
            );
        }

        return this._auxiliaryVault;
    }

    private get fileSaver() {
        if (!this._fileSaver) {
            throw new Error(
                "Client: To call this method, you need to provide fileSaver when initializing the sdk",
            );
        }

        return this._fileSaver;
    }

    public get vault() {
        if (!this._vault) {
            throw new Error(
                "Client: To call this method, you need to provide vault when initializing the sdk",
            );
        }

        return this._vault;
    }

    public get vaultsPassword() {
        if (!this._vaultsPassword) {
            throw new Error(`Client: _vaultsPassword is not provided!`);
        }

        return this._vaultsPassword;
    }

    static async create(options: ClientOptions): Promise<Client> {
        const {
            vault: optionsVault,
            password,
            uiEventDispatcher,
            auxiliaryVault,
            fileSaver,
        } = options;
        const vault = optionsVault ?? new Vault();

        if (vault.isVaultLocked()) {
            if (!password) {
                throw new Error(
                    "Vault is locked. Please provide a password to unlock it.",
                );
            }
            await vault.unlock(password);
        }

        return new Client(
            vault,
            uiEventDispatcher,
            auxiliaryVault,
            password,
            fileSaver,
        );
    }

    async createWallet(
        name: string,
        passwordProvider: TPasswordProviderWithPrivateKey,
        password: string,
    ): Promise<Wallet> {
        const wallet = await Wallet.fromPrivateKey(
            name,
            passwordProvider,
            password,
        );
        this.vault.addWallet(wallet);
        return wallet;
    }

    public async createSeed(
        mnemonicWords: string[],
        passwordProvider: TPasswordProvider,
        customHDPath?: string,
    ): Promise<Seed> {
        const mnemonic = MnemonicService.wordArrayToMnemonic(mnemonicWords);

        const seed = new Seed(mnemonic);

        StoreManager.saveSeed(
            seed.getId(),
            mnemonic,
            passwordProvider,
            customHDPath,
        );

        return seed;
    }

    // public async createMnemonicWallet(
    //     name: string,
    //     passwordProvider: TPasswordProviderWithPrivateKey,
    // ): Promise<Wallet> {
    //     const wallet = await Wallet.fromEncryptedData(name, passwordProvider);
    //     this.vault.addWallet(wallet);
    //     return wallet;
    // }

    selectActiveWallet(walletAddress: Address): boolean {
        if (this.vault.hasWallet(walletAddress)) {
            this.activeWalletAddress = walletAddress;
            return true;
        }
        return false;
    }

    getActiveWallet(): Wallet | undefined {
        if (this.activeWalletAddress) {
            return this.vault.getWallet(this.activeWalletAddress);
        }
        return undefined;
    }

    getWallets(): Wallet[] {
        return this.vault.getWallets();
    }

    public async setNetworkByName(networkName: NetworkName) {
        const updatedNetwork =
            this.networkProvider.setCurrentNetworkByName(networkName);
        BlockchainGateway.getInstance().setNetwork(updatedNetwork);

        await this.auxiliaryVault.unlock(this.vaultsPassword);
        this.auxiliaryVault.currentNetworkName = networkName;
        await this.auxiliaryVault.lock(this.vaultsPassword);
        this.auxiliaryVault.save();

        this.uiEventDispatcher.onCurrentNetworkChanged?.(updatedNetwork);
        return updatedNetwork;
    }

    public async getFilteredTxs(
        address: Address,
        filter: TransactionFilter,
        pagination: Pagination,
    ) {
        const network = this.networkProvider.currentNetwork;
        const auxVaultPassword = this.vaultsPassword;
        const result = await this.transactionsHistory.getFilteredTxs(
            network,
            address,
            filter,
            pagination,
            auxVaultPassword,
        );
        const addressReservations =
            await this.fundsReservation.getReservationsByTxs(
                network,
                address,
                this.vaultsPassword,
            );
        this.uiEventDispatcher.onReservationsChanged?.(addressReservations);
        return result;
    }

    public async getReservationsByTxs(address: Address) {
        const network = this.networkProvider.currentNetwork;
        const auxWalletPassword = this.vaultsPassword;
        return await this.fundsReservation.getReservationsByTxs(
            network,
            address,
            auxWalletPassword,
        );
    }
}

import { GasFeeVO, Network } from "@domains/";
import Wallet, { Address } from "@domains/Wallet";
import AssetsService from "@services/AssetsService";
import { TxHistory } from "@services/TxHistory";
import { IAuxiliaryVault } from "../ports/outbound/IAuxiliaryVault";
import { IVault } from "../ports/outbound/IVault";
import { IUiEventDispatcher } from "../ports/outbound/IUiEventDispatcher";
import { UiEventDispatcher } from "../../uiAdapters/UiEventDispatcher";
import { IFileSaver } from "../ports/outbound/IFileSaver";
import { NetworkProvider } from "./NetworkProvider";
import { loadNetworksFromEnv } from "../../infrastructureAdapters/loadNetworksFromEnv";
import { IHttpClient, IHttpClientFactory } from "../ports/outbound/IHttpClient";
import { axiosHttpClientFactory } from "../../infrastructureAdapters/AxiosHttpClient/factory";

export type ClientOptions  = {
    vault: IVault;
    auxilliaryVault: IAuxiliaryVault;
    fileSaver: IFileSaver;
} | {} & {fileSaver?: IFileSaver};

export class Client {
    /* infrastructure adapters */
    private readonly _vault?: IVault;
    private _auxilliaryVault?: IAuxiliaryVault;
    private _vaultsPassword?: string; 
    private _fileSaver?: IFileSaver;
    private httpClientFactory: IHttpClientFactory;
    /* /infrastructure adapters */

    /* application services */
    public assetsService: AssetsService;
    public txHistory: TxHistory;
    public uiEventDispatcher: IUiEventDispatcher;
    public networkProvider: NetworkProvider;
    /* /application services */

    private activeWalletAddress?: Address;

    private constructor(vault?: IVault, auxilliaryVault?: IAuxiliaryVault, vaultsPassword?: string, fileSaver?: IFileSaver) {
        this._vault = vault;
        this._auxilliaryVault = auxilliaryVault;
        this._vaultsPassword = vaultsPassword;
        this.assetsService = new AssetsService();
        this._fileSaver = fileSaver;
        this.txHistory = new TxHistory(this._auxilliaryVault, this._fileSaver);
        this.uiEventDispatcher = new UiEventDispatcher();
        this.vault.uiEventDispatcher = this.uiEventDispatcher;
        this.networkProvider = new NetworkProvider(loadNetworksFromEnv());
        this.httpClientFactory = axiosHttpClientFactory;
    }
    private get auxilliaryVault() {
        if(!this._auxilliaryVault) {
            throw new Error("Client: To call this method, you need to provide auxilliaryVault when initializing the sdk")
        }
        return this._auxilliaryVault;
    }
    private get fileSaver() {
        if(!this._fileSaver) {
            throw new Error("Client: To call this method, you need to provide fileSaver when initializing the sdk")
        }
        return this._fileSaver;
    }

    public get vault() {
        if(!this._vault) {
            throw new Error("Client: To call this method, you need to provide vault when initializing the sdk");
        }
        return this._vault;
    }
    public get vaultsPassword() {
        if(!this._vaultsPassword) {
            throw new Error(`Client: _vaultsPassword is not provided!`);
        }
        return this._vaultsPassword;
    }
    public set vaultsPassword(value: string) {
        this._vaultsPassword = value;
    }

    static async create(options: ClientOptions = {}): Promise<Client> {
        let vault;
        let auxilliaryVault;
        let vaultsPassword;
        if("vault" in options) {
            vault = options.vault;
            auxilliaryVault = options.auxilliaryVault;
        }
        return new Client(vault, auxilliaryVault, vaultsPassword, options.fileSaver);
    }

    async createWallet(name: string, privateKey: Uint8Array, password: string): Promise<Wallet> {
        const wallet = await Wallet.fromPrivateKey(name, privateKey, password);
        this.vault.addWallet(wallet);
        return wallet;
    }

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
    public async transfer(network: Network, fromAddress: Address, toAddress: Address, balance: bigint, amount: bigint, gasFee: GasFeeVO, password: string, wallet: Wallet) {
        const deployId = await this.assetsService.transfer(
            fromAddress,
            toAddress,
            balance,
            amount,
            gasFee,
            wallet,
            () => Promise.resolve(password),
        );
        const localTxs = await this.txHistory.storeTxInAuxVault(deployId, network, amount, fromAddress, toAddress, this.vaultsPassword);
        this.uiEventDispatcher.onLocalTxHistoryChanged?.(localTxs);
        return deployId;
    }
    public clearPersistance() {
        this._vault?.clearSavedVault();
        this._auxilliaryVault?.removeFromStorage();
    }
}

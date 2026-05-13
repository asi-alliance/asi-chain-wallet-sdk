import { GasFeeVO, IKeyManager, Network, NetworkName } from "../../domain";
import Wallet, { Address } from "../../domain/aggregates/Wallet";
import AssetsService from "./AssetsService";
import { TxHistory } from "./TxHistory";
import { IAuxiliaryVault } from "../ports/outbound/IAuxiliaryVault";
import { IVault } from "../ports/outbound/IVault";
import { IUiEventDispatcher } from "../ports/outbound/IUiEventDispatcher";
import { UiEventDispatcher } from "../../uiAdapters/UiEventDispatcher";
import { IFileSaver } from "../ports/outbound/IFileSaver";
import { NetworkProvider } from "./NetworkProvider";
import { loadNetworksFromEnv } from "../../infrastructure/adapters/loadNetworksFromEnv";
import { IHttpClient, IHttpClientFactory } from "../ports/outbound/IHttpClient";
import { axiosHttpClientFactory } from "../../infrastructure/adapters/AxiosHttpClient/factory";
import { Secp256k1KeysManagerAdapter } from "../../infrastructure";
import { BlockchainGateway} from "../../infrastructure/adapters/BlockchainGateway";
import { ClientConfiguration, defaultClientConfiguration } from "../configuration";

export type ClientOptions  = {
    vault: IVault;
    auxiliaryVault: IAuxiliaryVault;
    fileSaver?: IFileSaver;
    uiEventDispatcher?: IUiEventDispatcher;
    clientConfiguration?: ClientConfiguration;
} | {} & {fileSaver?: IFileSaver; clientConfiguration?: ClientConfiguration, uiEventDispatcher?: IUiEventDispatcher};

export class Client {
    /* infrastructure adapters */
    private readonly _vault?: IVault;
    private _auxiliaryVault?: IAuxiliaryVault;
    private _vaultsPassword?: string; 
    private _fileSaver?: IFileSaver;
    private httpClientFactory: IHttpClientFactory;
    public blockchainGateway: BlockchainGateway;
    /* /infrastructure adapters */

    /* application services */
    public assetsService: AssetsService;
    public txHistory: TxHistory;
    public uiEventDispatcher: IUiEventDispatcher;
    public networkProvider: NetworkProvider;
    /* /application services */

    /* domain services */
    public keyManager: IKeyManager;
    /* /domain services */

    private activeWalletAddress?: Address;
    
    /**
     * initial configuration
     */
    private configuration: ClientConfiguration;

    private constructor(vault?: IVault, auxiliaryVault?: IAuxiliaryVault, vaultsPassword?: string, fileSaver?: IFileSaver, uiEventDispatcher?: IUiEventDispatcher, configuration?: Partial<ClientConfiguration>) {
        this.configuration = {
            ...defaultClientConfiguration,
            ...configuration,
        };

        this._vault = vault;
        this._auxiliaryVault = auxiliaryVault;
        this._vaultsPassword = vaultsPassword;
        
        this.httpClientFactory = axiosHttpClientFactory;
        this._fileSaver = fileSaver;
        this.keyManager = new Secp256k1KeysManagerAdapter();
        
        this.networkProvider = new NetworkProvider(loadNetworksFromEnv(), null);
        this.blockchainGateway = new BlockchainGateway(this.httpClientFactory, this.networkProvider.getCurrentNetwork());
        this.assetsService = new AssetsService(this.blockchainGateway);
        
        this.txHistory = new TxHistory(this.blockchainGateway, this._auxiliaryVault, this._fileSaver);
        this.uiEventDispatcher = uiEventDispatcher ?? new UiEventDispatcher();
        this.vault.uiEventDispatcher = this.uiEventDispatcher;
        
        this.uiEventDispatcher.onCurrentNetworkChanged?.(this.networkProvider.getCurrentNetwork());
        this.uiEventDispatcher.onNetworksChanged?.(this.networkProvider.networks);
    }
    public get auxiliaryVault() {
        if(!this._auxiliaryVault) {
            throw new Error("Client: To call this method, you need to provide auxiliaryVault when initializing the sdk")
        }
        return this._auxiliaryVault;
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
    public async onFirstUnlock() {
        await this.auxiliaryVault.unlock(this.vaultsPassword);
        let networkNameToSet;
        if(!this.auxiliaryVault.currentNetworkName) {
            networkNameToSet = this.configuration.currentNetworkName;    
        } else if(!this.networkProvider.hasNetwork(this.auxiliaryVault.currentNetworkName)) {
            console.warn(`Client: onFirstUnlock: the saved network ${this.auxiliaryVault.currentNetworkName} is missing from the list of networks. Fallback to default network ${this.configuration.currentNetworkName}`);
            networkNameToSet=this.configuration.currentNetworkName;
        } else {
            networkNameToSet = this.auxiliaryVault.currentNetworkName;
        }
        await this.setNetworkByName(networkNameToSet);
        await this.auxiliaryVault.lock(this.vaultsPassword);
    }

    static async create(options: ClientOptions = {}): Promise<Client> {
        let vault;
        let auxiliaryVault;
        let vaultsPassword;
        if("vault" in options) {
            vault = options.vault;
            auxiliaryVault = options.auxiliaryVault;
        }
        return new Client(vault, auxiliaryVault, vaultsPassword, options.fileSaver, options.uiEventDispatcher, options.clientConfiguration);
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
    public async transfer(fromAddress: Address, toAddress: Address, balance: bigint, amount: bigint, gasFee: GasFeeVO, password: string, wallet: Wallet) {
        const network = this.networkProvider.currentNetwork;
        const deployId = await this.assetsService.transfer(
            network,
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
    public async getASIBalance(address: Address) {
        const network = this.networkProvider.currentNetwork;
        return await this.assetsService.getASIBalance(network, address);
    }
    public clearPersistance() {
        this._vault?.clearSavedVault();
        this._auxiliaryVault?.removeFromStorage();
    }
    public async setNetworkByName(networkName: NetworkName) {
        const updatedNetwork = this.networkProvider.setCurrentNetworkByName(networkName);
        this.blockchainGateway.setNetwork(updatedNetwork);
        
        await this.auxiliaryVault.unlock(this.vaultsPassword);
        this.auxiliaryVault.currentNetworkName = networkName;
        await this.auxiliaryVault.lock(this.vaultsPassword);
        this.auxiliaryVault.save();

        this.uiEventDispatcher.onCurrentNetworkChanged?.(updatedNetwork);
        return updatedNetwork;
    }
}

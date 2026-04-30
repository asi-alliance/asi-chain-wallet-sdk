import { GasFeeVO, Network } from "@domains/";
import Wallet, { Address } from "@domains/Wallet";
import AssetsService from "@services/AssetsService";
import { TxHistory } from "@services/TxHistory";
import { IAuxiliaryVault } from "./ports/outbound/IAuxiliaryVault";
import { IVault } from "./ports/outbound/IVault";

export type ClientOptions  = {
    vault: IVault;
    auxilliaryVault: IAuxiliaryVault;
    password: string;
} | {};

export default class Client {
    /* infrastructure adapters */
    private readonly _vault?: IVault;
    private auxilliaryVault?: IAuxiliaryVault;
    private _vaultsPassword?: string; 
    /* /infrastructure adapters */

    /* application services */
    private assetsService: AssetsService;
    private txHistory: TxHistory;
    /* /application services */

    private activeWalletAddress?: Address;

    private constructor(vault?: IVault, auxilliaryVault?: IAuxiliaryVault, vaultsPassword?: string) {
        this._vault = vault;
        this.auxilliaryVault = auxilliaryVault;
        this._vaultsPassword = vaultsPassword;
        this.assetsService = new AssetsService();
        this.txHistory = new TxHistory(this.auxilliaryVault);
    }

    private get vault() {
        if(!this._vault) {
            throw new Error(`Client: _vault=${this._vault}`);
        }
        return this._vault;
    }
    private get vaultsPassword() {
        if(!this._vaultsPassword) {
            throw new Error(`Client: _vaultsPassword is not provided!`);
        }
        return this._vaultsPassword;
    }

    static async create(options: ClientOptions = {}): Promise<Client> {
        let vault;
        let auxilliaryVault;
        let vaultsPassword;
        if("vault" in options) {
            vaultsPassword = options.password;
            vault = options.vault;
            auxilliaryVault = options.auxilliaryVault;
            await vault.unlock(vaultsPassword);
            await auxilliaryVault.unlock(vaultsPassword);
        }
        return new Client(vault, auxilliaryVault, vaultsPassword);
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
        this.txHistory.storeTxInAuxVault(deployId, network, amount, fromAddress, toAddress, this.vaultsPassword);
    }
}
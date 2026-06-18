import Wallet, { Address } from "@domains/Wallet";
import {
    TPasswordProvider,
    TPrivateKeyPasswordProvider,
} from "@domains/PasswordProvider";
import StoreManager from "@services/StoreManager";
import Vault from "@domains/Vault";

export interface ClientOptions {
    vault?: Vault;
    password?: string;
}

export default class Client {
    private readonly _vault: Vault;

    private activeWalletAddress?: Address;

    private constructor(vault: Vault) {
        this._vault = vault;
    }

    public get vault() {
        if (!this._vault) {
            throw new Error(
                "Client: To call this method, you need to provide vault when initializing the sdk",
            );
        }

        return this._vault;
    }

    static async create(options: ClientOptions): Promise<Client> {
        const { vault: optionsVault, password } = options;
        const vault = optionsVault ?? new Vault();

        if (vault.isVaultLocked()) {
            if (!password) {
                throw new Error(
                    "Vault is locked. Please provide a password to unlock it.",
                );
            }
            await vault.unlock(password);
        }

        return new Client(vault);
    }

    async createPKWallet(
        name: string,
        passwordProvider: TPrivateKeyPasswordProvider,
    ): Promise<Wallet> {
        const wallet = await Wallet.fromPrivateKey(name, passwordProvider);

        StoreManager.saveWallet(wallet.getId(), name, passwordProvider);

        this.vault.addWallet(wallet);
        return wallet;
    }


    public async createMnemonicWallet(
        mnemonic: string,
        name: string,
        passwordProvider: TPasswordProvider,
        index: number,
        customHDPath?: string,
    ): Promise<Wallet> {
        const { wallet, path } = await Wallet.fromMnemonic(
            mnemonic,
            name,
            passwordProvider,
            index,
            customHDPath,
        );

        StoreManager.saveWallet(wallet.getId(), name, passwordProvider, {
            seed: wallet.getSeed()!,
            index,
            path,
        });

        this.vault.addWallet(wallet);
        return wallet;
    }

    public async unlockWallet(
        id: string,
        passwordProvider: TPasswordProvider,
    ): Promise<Wallet> {
        return StoreManager.getWallet(id, passwordProvider);
    }

    public selectActiveWallet(walletAddress: Address): boolean {
        if (this.vault.hasWallet(walletAddress)) {
            this.activeWalletAddress = walletAddress;
            return true;
        }
        return false;
    }

    public getActiveWallet(): Wallet | undefined {
        if (this.activeWalletAddress) {
            return this.vault.getWallet(this.activeWalletAddress);
        }
        return undefined;
    }

    public getWallets(): Wallet[] {
        return this.vault.getWallets();
    }
}

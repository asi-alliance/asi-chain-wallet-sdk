import Vault from "@domains/Vault";
import Wallet, { Address } from "@domains/Wallet";

export interface ClientOptions {
    vault?: Vault;
    password?: string;
}

export class Client {
    private vault: Vault;
    private activeWalletAddress?: Address;

    private constructor(vault: Vault) {
        this.vault = vault;
    }

    static async create(options: ClientOptions = {}): Promise<Client> {
        const vault = options.vault || new Vault();
        if (vault.isVaultLocked()) {
            if (!options.password) {
                throw new Error("Vault is locked. Please provide a password to unlock it.");
            }
            await vault.unlock(options.password);
        }
        return new Client(vault);
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
}
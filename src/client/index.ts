import Account from "../domains/Account";
import SecureStorage from "../domains/SecureStorage";
import { DEFAULT_CLIENT_CONFIG, WalletClientConfig } from "../config";

export default class WalletClient {
    private static instance: WalletClient;
    private isInitialized: boolean = false;
    private mode: string = DEFAULT_CLIENT_CONFIG.mode;
    private network: string = DEFAULT_CLIENT_CONFIG.network;
    private storage: any = new SecureStorage();
    private accounts: Account[] = [];
    private config: WalletClientConfig = DEFAULT_CLIENT_CONFIG;

    private constructor() {}

    public static getInstance(): WalletClient {
        if (!WalletClient.instance) {
            WalletClient.instance = new WalletClient();
        }
        return WalletClient.instance;
    }

    public initialize(config: Partial<WalletClientConfig>): void {
        if (!config) {
            throw new Error("Configuration object is required for initialization.");
        }

        if (!config?.availableNetworks) {
            throw new Error("availableNetworks must be specified in the configuration.");
        }

        const initialConfig: WalletClientConfig = Object.assign(
            {},
            DEFAULT_CLIENT_CONFIG,
            config
        );
        
        this.updateConfig(initialConfig);
        this.isInitialized = true;
    }

    public async updateConfig(
        partial: Partial<WalletClientConfig>
    ): Promise<void> {

        const stableConfig = Object.assign({}, this.config);

        try {
            const config: WalletClientConfig = Object.assign(
                {},
                this.config,
                partial
            );

            for (const key in config) {
                if (
                    config.hasOwnProperty(key) &&
                    (this as any).hasOwnProperty(key)
                ) {
                    (this as any)[key] = (config as any)[key];
                }
            }

            await this.readAccountsFromStorage();
            await this.initializeServices();

            this.config = config;
        } catch (error) {
            this.updateConfig(stableConfig);
            throw new Error(`Failed to update config: ${error}`);
        }
    }

    // public createAccount(accountData: any): Account {
    //     this.ensureInitialized();

    // }

    // public restoreAccount(accountData: any): Account {
    //     this.ensureInitialized();
    // }

    private async readAccountsFromStorage(): Promise<void> {
        this.accounts = this.storage.read("accounts") || [];
    }

    private async initializeServices(): Promise<void> {
        
    }

    public getConfig(): WalletClientConfig {
        this.ensureInitialized();

        return this.config;
    }

    public getMode(): string {
        this.ensureInitialized();

        return this.mode;
    }

    public getNetwork(): string {
        this.ensureInitialized();

        return this.network;
    }

    public getAccounts(): any {
        this.ensureInitialized();

        return this.accounts;
    }

    private ensureInitialized(): void {
        if (!this.isInitialized) {
            throw new Error(
                "WalletClient is not initialized. Please call initialize() first."
            );
        }   
    };
}

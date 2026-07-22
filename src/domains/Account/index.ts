import Asset, { Assets, DEFAULT_ASSET } from "@domains/Asset";
import SecretsProvider, {
    IHDSecret,
    IPrivateKeyCredentials,
} from "@domains/SecretsProvider";
import WalletsService from "@services/Wallets";
import ApiServiceRegistry from "@domains/ApiServiceRegistry";
import { isPrivateKeySecretData } from "@utils/guards";
import KeyDerivationService from "@services/KeyDerivation";
import type { Address } from "@domains/Wallet";
import { Transaction } from "@domains/Transaction";
import { NetworkName } from "@domains/Network";
import { Pagination } from "@services/GraphqlParser/queryOptions";
import { generateRandomId } from "@utils/index";

export interface IPortfolioOptions {
    assets?: Assets;
    primaryAsset?: Asset;
}

export interface IAccountOptions {
    id?: string;
    name: string;
    index: number | null;
    address: Address;
    portfolioOptions?: IPortfolioOptions;
}

export type TEditableAccountOptions = Partial<Pick<IAccountOptions, "name">>;

export type TCreateAccountPayload = Omit<
    IAccountOptions,
    "address" | "index"
> & {
    index?: number;
};

export interface IAccountRecord {
    id: string;
    signerId: string;
    name: string;
    index: number | null;
}

class Account {
    private readonly id: string;
    private readonly index: number | null;
    private readonly address: Address;
    private name: string;
    private assets: Assets;
    private primaryAsset: Asset;

    constructor({
        id,
        name,
        index,
        portfolioOptions,
        address,
    }: IAccountOptions) {
        this.id = id ?? generateRandomId();
        this.name = name;
        this.index = index;
        this.address = address;
        this.assets =
            portfolioOptions?.assets ??
            new Map([[DEFAULT_ASSET.getId(), DEFAULT_ASSET]]);
        this.primaryAsset = portfolioOptions?.primaryAsset ?? DEFAULT_ASSET;
    }

    public getId(): string {
        return this.id;
    }

    public getName(): string {
        return this.name;
    }

    public getIndex(): number | null {
        return this.index;
    }

    public listAssets(): Asset[] {
        return Array.from(this.assets.values());
    }

    public getAddress(): Address {
        return this.address;
    }

    public getAsset(id: Asset["id"]): Asset | null {
        return this.assets.get(id) ?? null;
    }

    public registerAsset(asset: Asset): void {
        this.assets.set(asset.getId(), asset);
    }

    public setPrimaryAsset(id: Asset["id"]): void {
        const targetAsset: Asset | undefined = this.assets.get(id);

        if (!targetAsset) {
            console.error("Cannot set primary asset with incorrect id");

            return;
        }

        this.primaryAsset = targetAsset;
    }

    public static async create(
        accountOptions: TCreateAccountPayload,
        secretProvider: SecretsProvider,
    ): Promise<Account> {
        const secretData: IPrivateKeyCredentials | IHDSecret =
            secretProvider.getSecret();

        if (isPrivateKeySecretData(secretData)) {
            const address: Address = WalletsService.deriveAddressFromPrivateKey(
                secretData.privateKey,
            );

            return new Account({
                ...accountOptions,
                index: null,
                address,
            });
        }

        if (accountOptions.index !== undefined) {
            secretData.rootHDPath.setIndex(accountOptions.index);
        }

        const privateKey: Uint8Array =
            await KeyDerivationService.deriveKeyFromMnemonic(
                secretData.seed,
                secretData.rootHDPath,
            );

        const address: Address =
            WalletsService.deriveAddressFromPrivateKey(privateKey);

        privateKey.fill(0);

        return new Account({
            ...accountOptions,
            index: secretData.rootHDPath.getIndex(),
            address,
        });
    }

    public update(options: TEditableAccountOptions): void {
        if (!options.name) {
            return;
        }

        this.name = options.name;
    }

    public async getBalance() {
        return ApiServiceRegistry.getInstance().assets.getBalance(
            this.address,
            this.primaryAsset,
        );
    }

    public async getTransactionsHistory(
        networkName?: NetworkName,
        pagination?: Pagination,
    ): Promise<Transaction[]> {
        return ApiServiceRegistry.getInstance().accountData.getTransactionHistory(
            this.address,
            networkName,
            pagination,
        );
    }
}

export default Account;

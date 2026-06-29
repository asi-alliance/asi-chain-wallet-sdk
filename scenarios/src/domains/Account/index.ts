import Asset, { Assets } from "../Asset";
import { DEFAULT_ASSET } from "../../config";
import SecretsProvider, {
    IHDSecret,
    IPrivateKeyCredentials,
} from "../SecretsProvider";
import WalletsService from "../../services/Wallets";
import { isPrivateKeySecretData } from "../../utils/guards";
import KeyDerivationService from "../../services/KeyDerivation";
import ApiClientManager from "../ApiClientManager";
import ObserverClient, { IBalanceResponse } from "../ObserverClient";
import { Address } from "../Wallet";

export interface IPortfolioOptions {
    assets?: Assets;
    primaryAsset?: Asset;
}

export interface IAccountOptions {
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
    private readonly index: number | null;
    private readonly address: Address;
    private name: string;
    private assets: Assets;
    private primaryAsset: Asset;

    constructor({ name, index, portfolioOptions, address }: IAccountOptions) {
        this.name = name;
        this.index = index;
        this.address = address;
        this.assets =
            portfolioOptions?.assets ??
            new Map([[DEFAULT_ASSET.getId(), DEFAULT_ASSET]]);
        this.primaryAsset = portfolioOptions?.primaryAsset ?? DEFAULT_ASSET;
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
        const observer: ObserverClient =
            ApiClientManager.getInstance().getObserverClient();

        const response: IBalanceResponse = await observer.getBalance(
            this.address,
        );

        return {
            amount: BigInt(response.balance),
            asset: this.primaryAsset,
        };
    }
}

export default Account;

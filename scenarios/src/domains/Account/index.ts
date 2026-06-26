import Asset, { Assets } from "../Asset";
import { DEFAULT_ASSET } from "../../config";
import SecretsProvider, {
    IHDSecret,
    IPrivateKeyCredentials,
} from "../SecretsProvider";
import { Address } from "../Wallet";
import WalletsService from "../../services/Wallets";
import { isPrivateKeySecretData } from "../../utils/guards";
import KeysManager from "../../services/KeysManager";

export interface IPortfolioOptions {
    assets?: Assets;
    primaryAsset?: Asset;
}

export interface IAccountOptions {
    name: string;
    index: number | null;
    address: string;
    portfolioOptions?: IPortfolioOptions;
}

export interface IAccountRecord {
    id: string;
    signerId: string;
    name: string;
    index: number | null;
}

class Account {
    private readonly name: string;
    private readonly index: number | null;
    private readonly address: string;
    private assets: Assets;
    private primaryAsset: Asset | null;

    constructor({ name, index, portfolioOptions, address }: IAccountOptions) {
        this.name = name;
        this.index = index;
        this.address = address;
        this.assets =
            portfolioOptions?.assets ??
            new Map([[DEFAULT_ASSET.getId(), DEFAULT_ASSET]]);
        this.primaryAsset = portfolioOptions?.primaryAsset ?? null;
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

    public getAddress(): string {
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
        accountOptions: Omit<IAccountOptions, "address">,
        secretProvider: SecretsProvider<IPrivateKeyCredentials | IHDSecret>,
    ): Promise<Account> {
        const secretData: IPrivateKeyCredentials | IHDSecret =
            secretProvider.getSecret();

        if (isPrivateKeySecretData(secretData)) {
            const address: Address = WalletsService.deriveAddressFromPrivateKey(
                secretData.privateKey,
            );

            return new Account({
                ...accountOptions,
                address,
            });
        }

        const { privateKey } = await KeysManager.getPrivateDataFromSeed(
            secretData.seed,
            {
                customHDPath: secretData.rootHDPath,
            },
        );

        const address: Address =
            WalletsService.deriveAddressFromPrivateKey(privateKey);

        return new Account({ ...accountOptions, address });
    }
}

export default Account;

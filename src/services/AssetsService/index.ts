import Asset from "@domains/Asset";
import { IDeployTermFactory } from "@domains/Deploy/factory";
import NodeApiProvider from "@domains/NodeApiProvider";
import { Address } from "@domains/Wallet";
import { BalanceUnavailableError } from "@domains/CustomError";
import { parseAtomicAmount, validateAddress } from "@utils/index";
import { createDeployTermFactory } from "@fabrics/deployTermFactory";
import DeployService from "@services/DeployService";

export interface IBalanceData {
    amount: bigint;
    asset: Asset;
}

interface IExploreExprItem {
    ExprInt?: { data?: unknown };
    ExprString?: { data?: unknown };
}

export default class AssetsService {
    private readonly deployService: DeployService;
    private readonly nodeApiProvider: NodeApiProvider;

    constructor(
        deployService: DeployService,
        nodeApiProvider?: NodeApiProvider,
    ) {
        this.deployService = deployService;
        this.nodeApiProvider = nodeApiProvider ?? NodeApiProvider.getInstance();
    }

    private get terms(): IDeployTermFactory {
        return createDeployTermFactory(
            this.nodeApiProvider.getApi().getProfile(),
        );
    }

    public async getBalance(
        address: Address,
        asset: Asset,
    ): Promise<IBalanceData> {
        const validation = validateAddress(address);

        if (!validation.isValid) {
            throw new Error(
                `AssetsService.getBalance: Invalid address: ${validation.errorCode ?? "UNKNOWN"}`,
            );
        }

        const checkBalanceDeploy = this.terms.createCheckBalanceDeploy(address);

        let expr: IExploreExprItem[] | undefined;

        try {
            expr =
                await this.deployService.exploreDeployData(checkBalanceDeploy);
        } catch (error) {
            throw new BalanceUnavailableError(
                address,
                error instanceof Error ? error.message : String(error),
            );
        }

        const firstExpr: IExploreExprItem | undefined = expr?.[0];

        if (firstExpr?.ExprInt !== undefined) {
            const amount: bigint | null = parseAtomicAmount(
                firstExpr.ExprInt.data,
            );

            if (amount === null) {
                throw new BalanceUnavailableError(
                    address,
                    `the node returned an unexpected balance value: ${JSON.stringify(firstExpr.ExprInt.data)}`,
                );
            }

            return { amount, asset };
        }

        if (firstExpr?.ExprString !== undefined) {
            const vaultError: unknown = firstExpr.ExprString.data;

            throw new BalanceUnavailableError(
                address,
                vaultError
                    ? String(vaultError)
                    : "the vault returned an empty error",
            );
        }

        throw new BalanceUnavailableError(
            address,
            "the node returned no balance expression",
        );
    }
}

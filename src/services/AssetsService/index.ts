import Asset from "@domains/Asset";
import { IDeployTermFactory } from "@domains/Deploy/factory";
import NodeApiProvider from "@domains/NodeApiProvider";
import { Address } from "@domains/Wallet";
import {
    BalanceUnavailableError,
    UnknownErrorReason,
} from "@domains/CustomError";
import {
    getErrorMessage,
    isRecord,
    isUint256,
    parseAtomicAmount,
    validateAddress,
} from "@utils/index";
import { createDeployTermFactory } from "@fabrics/deployTermFactory";
import DeployService from "@services/DeployService";

export interface IBalanceData {
    amount: bigint;
    asset: Asset;
}

interface IExploreExprData {
    data?: unknown;
}

interface IExploreExprItem {
    ExprInt?: IExploreExprData | null;
    ExprBigInt?: IExploreExprData | null;
    ExprString?: IExploreExprData | null;
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
                getErrorMessage(error, UnknownErrorReason.NODE_API),
            );
        }

        const firstExpr: IExploreExprItem | undefined = expr?.[0];

        const integerExpr: IExploreExprData | null | undefined =
            firstExpr?.ExprInt ?? firstExpr?.ExprBigInt;

        if (isRecord(integerExpr)) {
            const amount: bigint | null = parseAtomicAmount(
                integerExpr.data,
            );

            if (amount === null || !isUint256(amount)) {
                throw new BalanceUnavailableError(
                    address,
                    `the node returned an unexpected balance value: ${JSON.stringify(integerExpr.data)}`,
                );
            }

            return { amount, asset };
        }

        const stringExpr: IExploreExprData | null | undefined =
            firstExpr?.ExprString;

        if (isRecord(stringExpr)) {
            const vaultError: unknown = stringExpr.data;

            throw new BalanceUnavailableError(
                address,
                typeof vaultError === "string" && vaultError
                    ? vaultError
                    : "the vault returned an empty or malformed error",
            );
        }

        throw new BalanceUnavailableError(
            address,
            "the node returned no balance expression",
        );
    }
}

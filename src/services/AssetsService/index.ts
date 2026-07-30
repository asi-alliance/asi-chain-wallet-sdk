import Asset from "@domains/Asset";
import { IDeployTermFactory } from "@domains/Deploy/factory";
import NodeApiProvider from "@domains/NodeApiProvider";
import { Address } from "@domains/Wallet";
import { validateAddress } from "@utils/index";
import { createDeployTermFactory } from "@utils/fabrics/deployTermFactory";
import DeployService from "@services/DeployService";

export interface IBalanceData {
    amount: bigint;
    asset: Asset;
}

export default class AssetsService {
    private readonly deployService: DeployService;
    private readonly nodeApiProvider: NodeApiProvider;

    constructor(
        deployService: DeployService,
        nodeApiProvider?: NodeApiProvider,
    ) {
        this.deployService = deployService;
        this.nodeApiProvider =
            nodeApiProvider ?? NodeApiProvider.getInstance();
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

        try {
            const expr =
                await this.deployService.exploreDeployData(checkBalanceDeploy);

            if (expr?.length > 0) {
                const firstExpr = expr[0];

                if (firstExpr?.ExprInt?.data !== undefined) {
                    return { amount: BigInt(firstExpr.ExprInt.data), asset };
                }

                if (firstExpr?.ExprString?.data !== undefined) {
                    throw new Error("Balance check error");
                }
            }

            return { amount: 0n, asset };
        } catch {
            return { amount: 0n, asset };
        }
    }
}

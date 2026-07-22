import Asset from "@domains/Asset";
import { createCheckBalanceDeploy } from "@domains/Deploy/factory";
import { Address } from "@domains/Wallet";
import { validateAddress } from "@utils/index";
import DeployService from "@services/DeployService";

export interface IBalanceData {
    amount: bigint;
    asset: Asset;
}

export default class AssetsService {
    private readonly deployService: DeployService;

    constructor(deployService: DeployService) {
        this.deployService = deployService;
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

        const checkBalanceDeploy = createCheckBalanceDeploy(address);

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

import SignerService from "@services/Signer";
import Wallet, { Address } from "@domains/Wallet";
import BlockchainGateway from "@domains/BlockchainGateway";
import {
    createTransferDeploy,
    createCheckBalanceDeploy,
} from "@domains/Deploy/factory";
import { INVALID_BLOCK_NUMBER } from "@utils/constants";
import { PasswordProvider } from "@domains/Signer";
import { DEFAULT_PHLO_LIMIT } from "@config";
import { DeployData } from "@domains/Deploy";

export default class AssetsService {
    public async transfer(
        fromAddress: string,
        toAddress: string,
        amount: bigint,
        wallet: Wallet,
        passwordProvider: PasswordProvider,
        phloLimit: number = DEFAULT_PHLO_LIMIT,
    ): Promise<string | undefined> {
        try {
            const gateway = BlockchainGateway.getInstance();

            const transferRho = createTransferDeploy(
                fromAddress,
                toAddress,
                amount,
            );

            const latestBlockNumber = await gateway.getLatestBlockNumber();

            if (latestBlockNumber === INVALID_BLOCK_NUMBER) {
                throw new Error("AssetsService.transfer: Invalid block number");
            }

            const deployData: DeployData = {
                term: transferRho,
                phloLimit,
                phloPrice: 1,
                validAfterBlockNumber: latestBlockNumber - 1,
                timestamp: Date.now(),
                shardId: "root",
            };

            const signedDeploy = await SignerService.sign(
                { wallet, data: deployData },
                passwordProvider,
            );

            console.log(
                "AssetsService.transfer: Signed deploy ready for submission:",
                JSON.stringify(signedDeploy, null, 2),
            );

            const deployId = await gateway.submitDeploy(signedDeploy);

            console.log(
                "AssetsService.transfer: Deploy submitted successfully with ID:",
                deployId,
            );

            return deployId;
        } catch (error: any) {
            const errorMessage =
                "AssetsService.transfer: " + (error as Error).message;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }

    async getASIBalance(address: Address): Promise<bigint> {
        const gateway = BlockchainGateway.getInstance();
        const checkBalanceRho = createCheckBalanceDeploy(address);

        try {
            const result = await gateway.exploreDeployData(checkBalanceRho);

            if (result && result.length > 0) {
                // expects the balance to be directly in expr[0].ExprInt.data
                const firstExpr = result[0];

                if (firstExpr?.ExprInt?.data) {
                    return BigInt(firstExpr.ExprInt.data);
                }

                if (firstExpr?.ExprString?.data) {
                    throw new Error("Balance check error:");
                }
            }

            return BigInt(0);
        } catch (error) {
            console.error(
                "AssetsService.getASIBalance: Error getting balance:",
                error,
            );
            return BigInt(0);
        }
    }
}

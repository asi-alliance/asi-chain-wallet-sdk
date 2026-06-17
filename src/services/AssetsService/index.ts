import SignerService from "@services/Signer";
import Wallet, { Address } from "@domains/Wallet";
import BlockchainGateway from "@domains/BlockchainGateway";
import {
    createTransferDeploy,
    createCheckBalanceDeploy,
} from "@domains/Deploy/factory";
import { INVALID_BLOCK_NUMBER } from "@utils/constants";
import { PasswordProvider } from "@domains/Signer";
import { DEFAULT_PHLO_LIMIT, defaultAsset } from "@config";
import { DeployData } from "@domains/Deploy";
import { validateAddress } from "@utils/validators";
import { RequireBlockchainGateway } from "@utils/decorators";
import Asset from "@domains/Asset";

export interface IBalanceData {
    amount: bigint;
    asset: Asset;
}

export default class AssetsService {
    private getBlockchainGateway(): BlockchainGateway {
        return BlockchainGateway.getInstance();
    }

    @RequireBlockchainGateway
    public async transfer(
        fromAddress: Address,
        toAddress: Address,
        amount: bigint,
        wallet: Wallet,
        _asset: Asset,
        passwordProvider: PasswordProvider,
        phloLimit: number = DEFAULT_PHLO_LIMIT,
    ): Promise<string | undefined> {
        try {
            const fromValidation = validateAddress(fromAddress);
            if (!fromValidation.isValid) {
                throw new Error(
                    `AssetsService.transfer: Invalid 'fromAddress': ${fromValidation.errorCode ?? "UNKNOWN"}`,
                );
            }

            const toValidation = validateAddress(toAddress);
            if (!toValidation.isValid) {
                throw new Error(
                    `AssetsService.transfer: Invalid 'toAddress': ${toValidation.errorCode ?? "UNKNOWN"}`,
                );
            }

            if (fromAddress === toAddress) {
                throw new Error(
                    "AssetsService.transfer: Sender and recipient addresses cannot be the same",
                );
            }

            if (amount <= 0n) {
                throw new Error(
                    "AssetsService.transfer: Transfer amount must be greater than zero",
                );
            }

            const gateway = this.getBlockchainGateway();

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

            const deployId = await gateway.submitDeploy(signedDeploy);

            return deployId;
        } catch (error: any) {
            const errorMessage =
                "AssetsService.transfer: " + (error as Error).message;
            throw new Error(errorMessage);
        }
    }

    @RequireBlockchainGateway
    async getBalance(address: Address, asset: Asset): Promise<IBalanceData> {
        const currentAsset: Asset = asset;

        const validation = validateAddress(address);
        if (!validation.isValid) {
            throw new Error(
                `AssetsService.getBalance: Invalid address: ${validation.errorCode ?? "UNKNOWN"}`,
            );
        }

        const gateway = this.getBlockchainGateway();
        const checkBalanceRho = createCheckBalanceDeploy(address);

        try {
            const result = await gateway.exploreDeployData(checkBalanceRho);

            if (result && result.length > 0) {
                // expects the balance to be directly in expr[0].ExprInt.data
                const firstExpr = result[0];

                if (firstExpr?.ExprInt?.data) {
                    return {
                        amount: BigInt(firstExpr.ExprInt.data),
                        asset: currentAsset,
                    };
                }

                if (firstExpr?.ExprString?.data) {
                    throw new Error("Balance check error:");
                }
            }

            return { amount: BigInt(0), asset: currentAsset };
        } catch (error) {
            return { amount: BigInt(0), asset: currentAsset };
        }
    }
}

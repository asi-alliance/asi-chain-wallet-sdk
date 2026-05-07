import SignerService from "../../../infrastructure/adapters/Signer";
import Wallet, { Address } from "../../../domain/aggregates/Wallet";
import { BlockchainGateway } from "../../../infrastructure/adapters/BlockchainGateway";
import FundsReservationService from "../FundsReservation";
import {
    createTransferDeploy,
    createCheckBalanceDeploy,
} from "../../../infrastructure/adapters/Rholang/DeployFactory";
import { INVALID_BLOCK_NUMBER } from "@domain/constants";
import { PasswordProvider } from "../../../infrastructure/adapters/Signer";
import { DEFAULT_PHLO_LIMIT } from "../../../infrastructure/configuration";
import { DeployData } from "../../common/DeployData";
import { validateAddress } from "@domain/services/validators";
import { RequireBlockchainGateway } from "../../common/decorators";
import { GasFeeVO } from "../../../domain/aggregates/Fee";
import { TransferValidator } from "./TransferValidator";

export default class AssetsService {

    
    private getBlockchainGateway(): BlockchainGateway {
        return BlockchainGateway.getInstance();
    }

    @RequireBlockchainGateway
    public async transfer(
        fromAddress: Address,
        toAddress: Address,
        balance: bigint,
        amount: bigint,
        gasFee: GasFeeVO,
        wallet: Wallet,
        passwordProvider: PasswordProvider,
        phloLimit: number = DEFAULT_PHLO_LIMIT,
    ): Promise<string> {
        const reservationService = FundsReservationService.getInstance();
        let reservationId: string | null = null;

        try {
            TransferValidator.validate(fromAddress, toAddress, balance, amount, gasFee, "AssetsService.transfer: ");

            // Lock funds for the transfer
            reservationId = reservationService.lock(
                fromAddress,
                amount + gasFee.gasFeeRange.max,
                5 * 60 * 1000, // 5 minutes expiration
                undefined,
                `Transfer to ${toAddress}`,
            );

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

            // Commit the reservation with the deploy ID
            if (reservationId && deployId) {
                reservationService.commit(reservationId, deployId);
            }

            return deployId;
        } catch (error: any) {
            // Release the reservation on error
            if (reservationId) {
                try {
                    reservationService.release(reservationId);
                } catch (releaseError: any) {
                    console.error(
                        "AssetsService.transfer: Failed to release reservation:",
                        releaseError,
                    );
                }
            }

            const errorMessage =
                "AssetsService.transfer: " + (error as Error).message;
            throw new Error(errorMessage);
        }
    }

    @RequireBlockchainGateway
    async getASIBalance(address: Address): Promise<bigint> {
        const validation = validateAddress(address);
        if (!validation.isValid) {
            throw new Error(
                `AssetsService.getASIBalance: Invalid address: ${validation.errorCode ?? "UNKNOWN"}`,
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
                    return BigInt(firstExpr.ExprInt.data);
                }

                if (firstExpr?.ExprString?.data) {
                    throw new Error("Balance check error:");
                }
            }

            return BigInt(0);
        } catch (error) {
            return BigInt(0);
        }
    }
}

export {TransferValidator} from "./TransferValidator";

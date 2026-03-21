import {
    ResubmitConfig,
    ResubmitResult,
    DeploymentErrorHandler,
    NodeProvider,
    FatalDeployErrors,
    BlockchainGateway,
    DeployStatusResult,
    DeployStatus,
} from "./types";
import NodeManager from "./NodeManager";
import SignerService from "@services/Signer";
import Wallet from "@domains/Wallet";
import { PasswordProvider } from "@domains/Signer";
import { DeployData } from "@domains/Deploy";
import { INVALID_BLOCK_NUMBER } from "@utils";
import { DEFAULT_PHLO_LIMIT } from "@config";

export default class DeployResubmitter {
    private readonly config: ResubmitConfig;
    private readonly nodeManager: NodeProvider;
    private readonly errorHandler: DeploymentErrorHandler;
    private startSubmissionTime = 0;

    constructor(config: ResubmitConfig, availableNodesUrls: string[]) {
        this.config = config;
        this.nodeManager = NodeManager.initialize(
            availableNodesUrls,
            config.nodeSelectionAttempts,
            config.useRandomNode,
        );
        this.errorHandler = new DeploymentErrorHandler();

        if (!BlockchainGateway.isInitialized())
            throw new Error("BlockchainGateway is not initialized");
    }

    private isDeployExpired(): boolean {
        const currentTime = Date.now();
        const elapsedSeconds = currentTime - this.startSubmissionTime;
        return elapsedSeconds >= this.config.deployValiditySeconds * 1000;
    }

    private sleep(sec: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, sec * 1000));
    }

    private async retryDeployToOneNode(
        rholangCode: string,
        wallet: Wallet,
        passwordProvider: PasswordProvider,
        phloLimit?: number,
    ): Promise<ResubmitResult> {
        let deployRetries = this.config.deployRetries;
        let deployResult: ResubmitResult = { success: false };

        while (deployRetries > 0 && !this.isDeployExpired()) {
            try {
                const gateway = BlockchainGateway.getInstance();
                const latestBlockNumber = await gateway.getLatestBlockNumber();

                if (latestBlockNumber === INVALID_BLOCK_NUMBER) {
                    throw new Error(
                        "DeployResubmitter.retryDeployToOneNode: Invalid block number",
                    );
                }

                const deployData: DeployData = {
                    term: rholangCode,
                    phloLimit: phloLimit || DEFAULT_PHLO_LIMIT,
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

                if (typeof deployId !== "string") {
                    const errorMessage =
                        "Invalid deploy ID received: " + deployId;
                    throw new Error(errorMessage);
                }

                deployResult = { success: true, deployId };

                return deployResult;
            } catch (error) {
                const errorMessage =
                    "DeployResubmitter.retryDeployToOneNode:" +
                    (error as Error).message;
                const errorType =
                    this.errorHandler.parseDeploymentError(errorMessage);
                console.error(errorMessage);

                deployResult.error = {
                    blockchainError: {
                        type: errorType,
                        message: errorMessage,
                    },
                };

                if (this.errorHandler.isDeploymentErrorFatal(errorType)) break;
                deployRetries--;
            }

            await this.sleep(this.config.deployIntervalSeconds);
        }

        if (this.isDeployExpired()) {
            deployResult.error = deployResult?.error || {};
            deployResult.error.exceededTimeout =
                FatalDeployErrors.DEPLOY_SUBMIT_TIMEOUT;
        }

        return { success: false, error: deployResult.error };
    }

    private async retryDeployToRandomNodes(
        rholangCode: string,
        wallet: Wallet,
        passwordProvider: PasswordProvider,
        phloLimit?: number,
    ): Promise<ResubmitResult> {
        let deployResult: ResubmitResult = { success: false };

        while (
            !this.isDeployExpired() &&
            this.nodeManager.getRetriesLeft() > 0
        ) {
            await this.nodeManager.connectActiveRandomNode();

            deployResult = await this.retryDeployToOneNode(
                rholangCode,
                wallet,
                passwordProvider,
                phloLimit,
            );

            if (deployResult.success) {
                break;
            }

            this.nodeManager.deactivateCurrentNode();

            if (!deployResult.error?.blockchainError?.type) {
                break
            }

            if (
                this.errorHandler.isDeploymentErrorFatal(
                    deployResult.error?.blockchainError?.type
                )
            )
                break;
        }

        return deployResult;
    }

    private async pollDeployStatus(deployId: string): Promise<ResubmitResult> {
        let last_error: any;

        while (!this.isDeployExpired()) {
            const checkDeployResult: DeployStatusResult =
                await BlockchainGateway.getInstance().getDeployStatus(deployId);
            const deployStatus: DeployStatus = checkDeployResult.status;

            if (deployStatus === DeployStatus.CHECK_ERROR) {
                const errorMessage = `DeployResubmitter.pollDeployStatus: ${
                    "errorMessage" in checkDeployResult
                        ? checkDeployResult.errorMessage
                        : "Unknown error"
                }`;
                const errorType =
                    this.errorHandler.parseDeploymentError(errorMessage);
                console.error(errorMessage);

                const blockchainError = {
                    type: errorType,
                    message: errorMessage,
                };

                // "Bad Request" isn't fatal for polling, deploy can be included in block later
                if (
                    this.errorHandler.isDeploymentErrorFatal(errorType) &&
                    !errorMessage.includes("Bad Request")
                )
                    return {
                        success: false,
                        deployStatus: DeployStatus.CHECK_ERROR,
                        error: { blockchainError },
                    };

                last_error = blockchainError;
            }

            console.log(
                "DeployResubmitter.pollDeployStatus: current deploy status:",
                deployStatus,
            );

            if (
                deployStatus == DeployStatus.INCLUDED_IN_BLOCK ||
                deployStatus == DeployStatus.FINALIZED
            )
                return {
                    success: true,
                    deployStatus: checkDeployResult.status,
                };

            await this.sleep(this.config.pollingIntervalSeconds);
        }

        return {
            success: false,
            deployStatus: last_error
                ? DeployStatus.CHECK_ERROR
                : DeployStatus.DEPLOYING,
            error: {
                ...last_error,
                exceededTimeout: FatalDeployErrors.BLOCK_INCLUSION_TIMEOUT,
            },
        };
    }

    /**

     * Main resubmit function
     * Executes the complete resubmit algorithm for deploy
     * NOT FOR "READ-ONLY" DEPLOYS (exploratory deploys)
     */
    public async resubmit(
        rholangCode: string,
        wallet: Wallet,
        passwordProvider: PasswordProvider,
        phloLimit?: number,
    ): Promise<ResubmitResult> {
        console.log(
            "DeployResubmitter: starting deploy submission with resubmission logic",
        );
        this.startSubmissionTime = Date.now();
        let deployResult: ResubmitResult;

        // 1.1: Try deploying with retries to first node if `useRandomNode` is false
        if (!this.config.useRandomNode) {
            await this.nodeManager.connectDefaultNode();

            deployResult = await this.retryDeployToOneNode(
                rholangCode,
                wallet,
                passwordProvider,
                phloLimit,
            );

            // 1.2: Try deploying with retries and random node switching
        } else {
            deployResult = await this.retryDeployToRandomNodes(
                rholangCode,
                wallet,
                passwordProvider,
                phloLimit,
            );
        }

        // validate this point 
        if (!deployResult.success || !deployResult?.deployId) {
            return deployResult;
        }

        // should enter pollDeployStatus in other method 
        console.log(
            `DeployResubmitter: deploy submitted successfully with ID: ${deployResult.deployId}. Starting to poll for status...`,
        );

        // 2: Poll for deploy status
        const pollResult = await this.pollDeployStatus(deployResult.deployId!);

        console.log(
            `DeployResubmitter: finished polling deploy status. Final status: ${pollResult.deployStatus}, success: ${pollResult.success}`,
        );

        return pollResult;
    }
}

import {
    ResubmitConfig,
    ResubmitResult,
    DeploymentErrorHandler,
    NodeProvider,
    FatalDeployErrors,
    DeployStatusResult,
    DeployStatus,
    BlockchainGateway
} from "./types";
import RChainService from "@services/Chain";


export default class DeployResubmitter {
    private readonly config: ResubmitConfig;
    private readonly nodeManager: NodeProvider;
    private readonly errorHandler: DeploymentErrorHandler;
    private startSubmissionTime = 0;

    constructor(
        config: ResubmitConfig,
        nodeManager: NodeProvider,
    ) {
        this.config = config;
        this.nodeManager = nodeManager;
        this.errorHandler = new DeploymentErrorHandler();
    }

    private isDeployExpired(): boolean {
        const currentTime = Date.now();
        const elapsedSeconds = (currentTime - this.startSubmissionTime) / 1000;

        return elapsedSeconds >= this.config.deployValidityTime;
    }

    private async retryDeployToOneNode(
        rholangCode: string,
        privateKey: string,
        phloLimit?: number,
    ): Promise<ResubmitResult> {
        let deployRetries = this.config.deployRetries;
        let deployResult: ResubmitResult = { success: false };

        while (deployRetries > 0 && !this.isDeployExpired()) {
            try {
                const chainService = new RChainService();
                const deployId = await chainService.sendDeploy(
                    rholangCode,
                    privateKey,
                    phloLimit
                );

                if (typeof deployId !== "string") {
                    const errorMessage = 'Invalid deploy ID received: ' + deployId;
                    throw new Error(errorMessage);
                }   

                deployResult = { success: true, deployId };
                return deployResult;
            } catch (error) {
                const errorMessage = "DeployResubmitter.retryDeployToOneNode:" + (error as Error).message;
                const errorType = this.errorHandler.parseDeploymentError(errorMessage);
                console.error(errorMessage);

                if(this.errorHandler.isDeploymentErrorFatal(errorType)) {
                    deployResult.error.blockchainError = {
                        type: errorType,
                        message: errorMessage,
                    };
                    break;
                }

                deployResult.error.blockchainError = {
                    type: errorType,
                    message: errorMessage,
                };

                deployRetries --;
            } 

            await this.sleep(this.config.deployInterval);
        }
        return { success: false, error: deployResult.error };
    }

    private async pollDeployStatus(deployId: string): Promise<ResubmitResult> {
        while (!this.isDeployExpired()) {
            const checkDeployResult: DeployStatusResult = await BlockchainGateway.getInstance().getDeployStatus(deployId);
            const deployStatus: DeployStatus = checkDeployResult.status;

            if (deployStatus === DeployStatus.CHECK_ERROR) {
                const errorMessage = `DeployResubmitter.pollDeployStatus: ${
                    'errorMessage' in checkDeployResult ? checkDeployResult.errorMessage : 'Unknown error'
                }`;
                const errorType = this.errorHandler.parseDeploymentError(errorMessage);
                console.error(errorMessage);

                const blockchainError = {
                    type: errorType,
                    message: errorMessage,
                };

                return { success: false, deployStatus, error: { blockchainError } }
            }

            // if included in block or finalized 
            if (deployStatus !== DeployStatus.DEPLOYING) 
                return { success: true, deployStatus: checkDeployResult.status };

            await this.sleep(this.config.pollingInterval);
        }
        return { 
            success: false, 
            deployStatus: DeployStatus.DEPLOYING, 
            error: { exceededTimeout: FatalDeployErrors.BLOCK_INCLUSION_TIMEOUT } 
        };
    }

    private sleep(sec: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, sec * 1000));
    }

    //async deployWithRetries

    /**

     * Main resubmit function
     * Executes the complete transaction resubmit algorithm 
     */
    async resubmit(
        rholangCode: string,
        privateKey: string,
        phloLimit?: number
    ): Promise<ResubmitResult> {
        let deployResult: ResubmitResult = {success: false};
        this.startSubmissionTime = Date.now();

        // 1: Deploy with retries
        while (
            !deployResult.success && 
            !this.isDeployExpired() && 
            this.nodeManager.getRemainingAttempts() > 0
        ) {       
            await this.nodeManager.connectActiveRandomNode();
                
            deployResult = await this.retryDeployToOneNode(
                rholangCode,
                privateKey,
                phloLimit
            );

            if (!deployResult.success) 
                this.nodeManager.recordCurrentNodeFailure();

            if(this.errorHandler.isDeploymentErrorFatal(deployResult.error.blockchainError?.type!)) {
                return deployResult;
            }
        }

        if(this.isDeployExpired()) {
            deployResult.error.exceededTimeout = FatalDeployErrors.DEPLOY_SUBMIT_TIMEOUT;
            return deployResult;
        }

        if (!deployResult.success)
            return deployResult;
    

        // 2: Poll for deploy status
        const pollResult = await this.pollDeployStatus(deployResult.deployId!);   
        return pollResult;
    }
}
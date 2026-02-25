import {
    ResubmitConfig,
    ResubmitResult,
    DeploymentErrorHandler,
    NodeProvider,
    FatalDeployErrors,
    DeployStatusResult,
    DeployStatus,
    BlockchainGateway,
    NodeUrl
} from "./types";
import NodeManager from "./NodeManager";
import RChainService from "@services/Chain";


export default class DeployResubmitter {
    private readonly config: ResubmitConfig;
    private readonly nodeManager: NodeProvider;
    private readonly errorHandler: DeploymentErrorHandler;
    private startSubmissionTime = 0;

    constructor(
        config: ResubmitConfig,
        availableNodesUrls: NodeUrl[]
    ) {
        this.config = config;
        this.nodeManager = NodeManager.initialize(
            availableNodesUrls, 
            config.nodeSelectionAttempts, 
            config.useRandomNode
        );
        this.errorHandler = new DeploymentErrorHandler();
    }

    private isDeployExpired(): boolean {
        const currentTime = Date.now();
        const elapsedSeconds = (currentTime - this.startSubmissionTime) / 1000;

        return elapsedSeconds >= this.config.deployValiditySeconds;
    }

    private sleep(sec: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, sec * 1000));
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

                deployResult.error = {  
                    blockchainError: {
                        type: errorType,
                        message: errorMessage,
                    }
                };

                if(this.errorHandler.isDeploymentErrorFatal(errorType)) 
                    break;
                deployRetries --;
            } 

            await this.sleep(this.config.deployIntervalSeconds);
        }
        
        if(this.isDeployExpired()) {
            deployResult.error = deployResult?.error || {};
            deployResult.error.exceededTimeout = FatalDeployErrors.DEPLOY_SUBMIT_TIMEOUT;
        }

        return { success: false, error: deployResult.error };
    }

    private async retryDeployToRandomNodes(
        rholangCode: string,
        privateKey: string,
        phloLimit?: number
    ): Promise<ResubmitResult> {
        let deployResult: ResubmitResult = { success: false };
        this.startSubmissionTime = Date.now();

        while (
            !this.isDeployExpired() &&
            this.nodeManager.getRetriesLeft() > 0
        ) {
            await this.nodeManager.connectActiveRandomNode();

            deployResult = await this.retryDeployToOneNode(
                rholangCode,
                privateKey,
                phloLimit
            );

            if (deployResult.success)
                break;
                
            this.nodeManager.deactivateCurrentNode();

            if (
                this.errorHandler.isDeploymentErrorFatal(
                    deployResult.error?.blockchainError?.type!
                )
            ) 
                break;
        }
        
        return deployResult;
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
            
            if (deployStatus !== DeployStatus.DEPLOYING)                  // if included in block or finalized 
                return { success: true, deployStatus: checkDeployResult.status };

            await this.sleep(this.config.pollingIntervalSeconds);
        }

        return { 
            success: false, 
            deployStatus: DeployStatus.DEPLOYING, 
            error: { exceededTimeout: FatalDeployErrors.BLOCK_INCLUSION_TIMEOUT } 
        };
    }

    /**

     * Main resubmit function
     * Executes the complete transaction resubmit algorithm 
     */
    public async resubmit(
        rholangCode: string,
        privateKey: string,
        phloLimit?: number
    ): Promise<ResubmitResult> {
        let deployResult: ResubmitResult = { success: false };

        // 1.1: Try deploying with retries to first node if `useRandomNode` is false
        if (!this.config.useRandomNode) {
            await this.nodeManager.connectDefaultNode();
            
            deployResult = await this.retryDeployToOneNode(
                rholangCode,
                privateKey,
                phloLimit
            );

        // 1.2: Try deploying with retries and random node switching
        } else {
            deployResult = await this.retryDeployToRandomNodes(
                rholangCode,
                privateKey,
                phloLimit
            );
        }

        if (!deployResult.success) 
            return deployResult;
        

        // 2: Poll for deploy status
        const pollResult = await this.pollDeployStatus(deployResult.deployId!);   
        
        return pollResult;
    }
}
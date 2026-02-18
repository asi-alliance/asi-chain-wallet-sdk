import {
    ResubmitConfig,
    ResubmitResult,
    DeploymentErrorHandler,
    NodeProvider,
    FatalDeployErrors,
    DeployResult
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

   
    private async deployWithRetries(
        rholangCode: string,
        privateKey: string,
        phloLimit?: number,
    ): Promise<DeployResult> {
        let retries = this.config.retries;

        while (retries >= 0) {
            try {
                const chainService = new RChainService();
                const deployId = await chainService.sendDeploy(
                    rholangCode,
                    privateKey,
                    phloLimit
                );

                if (typeof deployId !== "string") {
                    const errorMessage = 'DeployResubmitter.deployWithRetries: Invalid deploy ID received: ' + deployId;
                    console.error(errorMessage);
                    throw new Error(errorMessage);
                }   
                return { success: true, deployId };
            } catch (error) {
                const errorMessage = (error as Error).message;
                const errorType = this.errorHandler.parseDeploymentError(errorMessage);

                return {
                    success: false, 
                    error: 
                        { 
                            type: errorType, 
                            message: errorMessage 
                        }
                };
            }
        }
    }

    private isDeployExpired(): boolean {
        const currentTime = Date.now();
        const elapsedSeconds = (currentTime - this.startSubmissionTime) / 1000;

        return elapsedSeconds >= this.config.deployValidityTime;
    }


    /**
     * Main resubmit function
     * Executes the complete transaction resubmit algorithm 
     */
    async resubmit(
        rholangCode: string,
        privateKey: string,
        phloLimit?: number
    ): Promise<ResubmitResult> {
        try {
            let deployResult: DeployResult = {success: false};
            this.startSubmissionTime = Date.now();

            while (!deployResult.success && !this.isDeployExpired() && this.nodeManager.getRemainingAttempts() >= 0) {       
                await this.nodeManager.connectActiveRandomNode();
                deployResult = await this.deployWithRetries(
                    rholangCode,
                    privateKey,
                    phloLimit
                );
            }

            if(!deployResult.success) 
                throw new Error(deployResult.error.message);

        } catch (error) {
            return {
                success: false,
                // TODO: THINK about approp errror type
                error: {
                    type: FatalDeployErrors.UNKNOWN_ERROR,
                    message: (error as Error).message,
                },
            };
        }
    }
}
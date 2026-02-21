import { 
    DeploymentErrorType, 
    FatalDeployErrors, 
    RecoverableDeployErrors,
    DeploymentErrorHandler,
} from "@domains/Error";
import BlockchainGateway, { DeployStatusResult, DeployStatus }from "@domains/BlockchainGateway";

export { 
    DeployStatus,
    DeployStatusResult,
    DeploymentErrorHandler, 
    RecoverableDeployErrors, 
    FatalDeployErrors,
    BlockchainGateway
};

export type NodeUrl = string;

export interface NodeProvider {
    connectActiveRandomNode(): Promise<void>;
    recordCurrentNodeFailure(): void;
    isInitialized(): boolean;
    getRemainingAttempts(): number;
}

export interface ResubmitConfig {
    phloPrice: number;

    isRandomNodeUsed: boolean;
    deployValidityTime: number;
    nodeSelectionAttempts: number;
    deployRetries: number;

    deployInterval: number;
    pollingInterval: number;
}

export interface ErrorDetail {
    blockchainError?: {
        type: DeploymentErrorType;
        message: string;
    };
    exceededTimeout?: FatalDeployErrors.DEPLOY_SUBMIT_TIMEOUT | FatalDeployErrors.BLOCK_INCLUSION_TIMEOUT;
}

export interface ResubmitResult {
    success: boolean;
    deployId?: string;
    deployStatus?: DeployStatus;
    error?: ErrorDetail;
}

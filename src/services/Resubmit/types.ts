import { 
    DeploymentErrorType, 
    FatalDeployErrors, 
    RecoverableDeployErrors,
    DeploymentErrorHandler,
} from "@domains/Error";
import BlockchainGateway, {type DeployStatusResult, DeployStatus } from '@domains/BlockchainGateway';

export { 
    DeployStatus,
    DeployStatusResult,
    DeploymentErrorHandler, 
    RecoverableDeployErrors, 
    FatalDeployErrors,
    BlockchainGateway
};

export interface NodeProvider {
    connectDefaultNode(): Promise<void>;
    connectActiveRandomNode(): Promise<void>;
    deactivateCurrentNode(): void;
    isInitialized(): boolean;
    getRetriesLeft(): number;
}

export interface ResubmitConfig {
    phloPrice: number;

    useRandomNode: boolean;
    deployValiditySeconds: number;
    nodeSelectionAttempts: number;
    deployRetries: number;

    deployIntervalSeconds: number;
    pollingIntervalSeconds: number;
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

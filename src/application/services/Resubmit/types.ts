import { 
    DeploymentErrorType, 
    FatalDeployErrors, 
    RecoverableDeployErrors,
    DeploymentErrorHandler,
} from "@/domain/valueObjects/Error";
import {BlockchainGateway, ReadOnlyTxStatus} from "@/infrastructure/adapters/BlockchainGateway";
import { DeployStatusResult } from "@/infrastructure/adapters/BlockchainGateway/ReadOnlyGateway/ReadOnlyGateway";

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
    deployStatus?: ReadOnlyTxStatus;
    error?: ErrorDetail;
}

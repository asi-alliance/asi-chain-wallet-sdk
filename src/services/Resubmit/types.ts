import { 
    DeploymentErrorType, 
    FatalDeployErrors, 
    RecoverableDeployErrors,
    DeploymentErrorHandler,
} from "@domains/Error";
import { RChainServiceConfig } from "@services/Chain";


export { DeploymentErrorHandler, RecoverableDeployErrors, FatalDeployErrors};

export type NodeUrl = string;

export interface NodeProvider {
    connectActiveRandomNode(): Promise<void>;
    recordCurrentNodeFailure(nodeUrl: NodeUrl): void;
    isInitializedWithActiveNode(): boolean;
    getRemainingAttempts(): number;
}

export interface ResubmitConfig {
    deployValidityTime: number;
    retries: number;
    nodeSelectionAttempts: number;
    deployLifeSpan: number;
    phloPrice: number;
    isRandomNodeUsed: boolean;
    pollingInterval: number;
    rchainServiceConfig?: RChainServiceConfig;
}

export interface ResubmitResult {
    success: boolean;
    deployId?: string;
    error?: {
        type: DeploymentErrorType;
        message: string;
    };
}

export interface DeployResult {
    success: boolean;
    deployId?: string;
    error?: {
        type: FatalDeployErrors | RecoverableDeployErrors;
        message: string;
    };
}

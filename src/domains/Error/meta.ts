export enum RecoverableDeployErrors {
    READ_ONLY_NODE = "READ_ONLY_NODE",
    CASPER_INSTANCE_UNAVAILABLE = "CASPER_INSTANCE_UNAVAILABLE",
    INVALID_DEPLOY_ID = "INVALID_DEPLOY_ID",
    INVALID_BLOCK_NUMBER = "INVALID_BLOCK_NUMBER"
}

export enum FatalDeployErrors {
    INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
    WRONG_NETWORK = "WRONG_NETWORK",
    PARSING_ERROR = "PARSING_ERROR",
    LOW_PHLO_PRICE = "LOW_PHLO_PRICE",
    SIGNATURE_ERROR = "SIGNATURE_ERROR",
    STORAGE_RETRIEVAL_ERROR = "STORAGE_RETRIEVAL_ERROR",
    UNKNOWN_ERROR = "UNKNOWN_ERROR",
    DEPLOY_SUBMIT_TIMEOUT = "DEPLOY_SUBMIT_TIMEOUT",
    BLOCK_INCLUSION_TIMEOUT = "BLOCK_INCLUSION_TIMEOUT",
    FINALIZATION_TIMEOUT = "FINALIZATION_TIMEOUT",
}

export type DeploymentErrorType = RecoverableDeployErrors | FatalDeployErrors;

export const deploymentErrorMessages: Record<DeploymentErrorType, string> = {
    [RecoverableDeployErrors.READ_ONLY_NODE]: "Node is read-only. Trying another node...",
    [RecoverableDeployErrors.CASPER_INSTANCE_UNAVAILABLE]: "Casper instance not available. Trying another node...",
    [RecoverableDeployErrors.INVALID_DEPLOY_ID]: "Invalid deploy ID. Please try again.",
    [RecoverableDeployErrors.INVALID_BLOCK_NUMBER]: "Invalid block number. Please try again.",
    [FatalDeployErrors.INSUFFICIENT_BALANCE]: "Insufficient balance. Please top up your account.",
    [FatalDeployErrors.WRONG_NETWORK]: "Wrong network. Please contact technical support.",
    [FatalDeployErrors.PARSING_ERROR]: "Parsing error. Please contact technical support.",
    [FatalDeployErrors.LOW_PHLO_PRICE]: "Phlo price too low. Please rebuild the transaction with a higher phlo price.",
    [FatalDeployErrors.SIGNATURE_ERROR]: "Signature verification failed. Please try again.",
    [FatalDeployErrors.STORAGE_RETRIEVAL_ERROR]: "Storage retrieval error. Please try again later.",
    [FatalDeployErrors.UNKNOWN_ERROR]: "An unknown error occurred. Please try again.",
    [FatalDeployErrors.DEPLOY_SUBMIT_TIMEOUT]: "Deploy submission timed out. Please try again.",
    [FatalDeployErrors.BLOCK_INCLUSION_TIMEOUT]: "Deploy was not included in a block within the expected time.",
    [FatalDeployErrors.FINALIZATION_TIMEOUT]: "Block finalization polling timed out.",
};

export function getDeploymentErrorMessage(errorType: DeploymentErrorType): string {
    return deploymentErrorMessages[errorType] ?? "An unknown error occurred. Please try again.";
}

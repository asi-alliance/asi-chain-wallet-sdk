export enum DeploymentErrorType {
    INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
    READ_ONLY_NODE = "READ_ONLY_NODE",
    WRONG_NETWORK = "WRONG_NETWORK",
    PARSING_ERROR = "PARSING_ERROR",
    LOW_PHLO_PRICE = "LOW_PHLO_PRICE",
    CASPER_INSTANCE_UNAVAILABLE = "CASPER_INSTANCE_UNAVAILABLE",
    SIGNATURE_ERROR = "SIGNATURE_ERROR",
    STORAGE_RETRIEVAL_ERROR = "STORAGE_RETRIEVAL_ERROR",
    UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export default class DeploymentErrorHandler {
    public parseDeploymentError(errorMessage: string): DeploymentErrorType {
        const lowerMessage = errorMessage.toLowerCase();

        if (lowerMessage.includes("insufficient balance")) {
            return DeploymentErrorType.INSUFFICIENT_BALANCE;
        }
        if (lowerMessage.includes("read only")) {
            return DeploymentErrorType.READ_ONLY_NODE;
        }
        if (lowerMessage.includes("wrong network")) {
            return DeploymentErrorType.WRONG_NETWORK;
        }
        if (lowerMessage.includes("parsing error")) {
            return DeploymentErrorType.PARSING_ERROR;
        }
        if (lowerMessage.includes("low") && lowerMessage.includes("phlo")) {
            return DeploymentErrorType.LOW_PHLO_PRICE;
        }
        if (lowerMessage.includes("casper instance")) {
            return DeploymentErrorType.CASPER_INSTANCE_UNAVAILABLE;
        }
        if (
            lowerMessage.includes("signature") ||
            lowerMessage.includes("sign") ||
            lowerMessage.includes("invalid signature")
        ) {
            return DeploymentErrorType.SIGNATURE_ERROR;
        }
        if (
            lowerMessage.includes("storage") ||
            lowerMessage.includes("retrieval")
        ) {
            return DeploymentErrorType.STORAGE_RETRIEVAL_ERROR;
        }

        return DeploymentErrorType.UNKNOWN_ERROR;
    }

    public isRetriableDeploymentError(errorType: DeploymentErrorType): boolean {
        return (
            errorType === DeploymentErrorType.READ_ONLY_NODE ||
            errorType === DeploymentErrorType.CASPER_INSTANCE_UNAVAILABLE
        );
    }

    public isFatalDeploymentError(errorType: DeploymentErrorType): boolean {
        return (
            errorType === DeploymentErrorType.INSUFFICIENT_BALANCE ||
            errorType === DeploymentErrorType.WRONG_NETWORK ||
            errorType === DeploymentErrorType.PARSING_ERROR ||
            errorType === DeploymentErrorType.LOW_PHLO_PRICE ||
            errorType === DeploymentErrorType.SIGNATURE_ERROR
        );
    }

    public isRetriablePollingError(errorMessage: string): boolean {
        const lowerMessage = errorMessage.toLowerCase();
        return (
            lowerMessage.includes("casper instance") ||
            lowerMessage.includes("storage") ||
            lowerMessage.includes("parsing")
        );
    }

    public getErrorMessage(errorType: DeploymentErrorType): string {
        switch (errorType) {
            case DeploymentErrorType.INSUFFICIENT_BALANCE:
                return "Insufficient balance. Please top up your account.";
            case DeploymentErrorType.READ_ONLY_NODE:
                return "Node is read-only. Trying another node...";
            case DeploymentErrorType.WRONG_NETWORK:
                return "Wrong network. Please contact technical support.";
            case DeploymentErrorType.PARSING_ERROR:
                return "Parsing error. Please contact technical support.";
            case DeploymentErrorType.LOW_PHLO_PRICE:
                return "Phlo price too low. Please rebuild the transaction with a higher phlo price.";
            case DeploymentErrorType.CASPER_INSTANCE_UNAVAILABLE:
                return "Casper instance not available. Trying another node...";
            case DeploymentErrorType.SIGNATURE_ERROR:
                return "Signature verification failed. Please try again.";
            case DeploymentErrorType.STORAGE_RETRIEVAL_ERROR:
                return "Storage retrieval error. Please try again later.";
            case DeploymentErrorType.UNKNOWN_ERROR:
            default:
                return "An unknown error occurred. Please try again.";
        }
    }
}

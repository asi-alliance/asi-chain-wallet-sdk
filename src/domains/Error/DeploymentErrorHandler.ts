import {
    RecoverableDeployErrors,
    deploymentErrorMessages,
    DeploymentErrorType,
    FatalDeployErrors,
} from "./meta";

function useLowerCaseMessage<T>(
    value: Function,
    context: ClassMethodDecoratorContext,
) {
    return function (this: T, ...methodArguments: any[]) {
        if (typeof methodArguments[0] === "string") {
            methodArguments[0] = methodArguments[0].toLowerCase();
        }

        return value.apply(this, methodArguments);
    };
}

export default class DeploymentErrorHandler {
    // private?
    @useLowerCaseMessage
    public parseDeploymentError(errorMessage: string): DeploymentErrorType {
        if (errorMessage.includes("read only")) {
            return RecoverableDeployErrors.READ_ONLY_NODE;
        }

        if (errorMessage.includes("casper instance")) {
            return RecoverableDeployErrors.CASPER_INSTANCE_UNAVAILABLE;
        }

        if (errorMessage.includes("insufficient balance")) {
            return FatalDeployErrors.INSUFFICIENT_BALANCE;
        }

        if (errorMessage.includes("wrong network")) {
            return FatalDeployErrors.WRONG_NETWORK;
        }

        if (errorMessage.includes("parsing error")) {
            return FatalDeployErrors.PARSING_ERROR;
        }

        if (errorMessage.includes("low") && errorMessage.includes("phlo")) {
            return FatalDeployErrors.LOW_PHLO_PRICE;
        }

        if (
            errorMessage.includes("signature") ||
            errorMessage.includes("sign") ||
            errorMessage.includes("invalid signature")
        ) {
            return FatalDeployErrors.SIGNATURE_ERROR;
        }

        if (
            errorMessage.includes("storage") ||
            errorMessage.includes("retrieval")
        ) {
            return FatalDeployErrors.STORAGE_RETRIEVAL_ERROR;
        }

        return FatalDeployErrors.UNKNOWN_ERROR;
    }

    // private?
    public isDeploymentErrorRecoverable(errorType: DeploymentErrorType): boolean {
        return Object.values(RecoverableDeployErrors).includes(errorType as RecoverableDeployErrors);
    }

    // private?
    public isDeploymentErrorFatal(errorType: DeploymentErrorType): boolean {
        return Object.values(FatalDeployErrors).includes(errorType as FatalDeployErrors);
    }

    // private?
    @useLowerCaseMessage
    public isPollingErrorRecoverable(errorMessage: string): boolean {
        return (
            errorMessage.includes("casper instance") ||
            errorMessage.includes("storage") ||
            errorMessage.includes("parsing")
        );
    }

    // private?
    public getErrorMessageByErrorType(errorType: DeploymentErrorType): string {
        return (
            deploymentErrorMessages[errorType] ??
            deploymentErrorMessages[FatalDeployErrors.UNKNOWN_ERROR]
        );
    }
}

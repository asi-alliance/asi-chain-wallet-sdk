import { CustomError, getErrorMessage } from "asi-wallet-sdk";

export const toErrorText = (error: unknown, fallback: string): string => {
    const message: string = getErrorMessage(error, fallback);

    if (error instanceof CustomError) {
        return `${error.code}: ${message}`;
    }

    return message;
};

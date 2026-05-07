import axios from "axios";

    export function getGatewayErrorMessage(error: any): string {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status ?? error.code;
            const statusText = error.response?.statusText ?? ""; 
            const url = error.config?.url ?? "";
            return `Axios error while requesting "${url}": [${status}] ${statusText} - ${error.message}`;
        }

        if (error instanceof Error) {
            return error.message;
        }
        
        return String(error);
    }
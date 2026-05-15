import { IHttpClient } from "../../../application/ports/outbound/IHttpClient";
import { SignedResult } from "../Signer";
import { getGatewayErrorMessage } from "./common";

export class ValidatorGateway {
    private httpClient: IHttpClient;
    constructor(httpClient: IHttpClient) {
        this.httpClient = httpClient;
    }


    public async submitDeploy(
        deployData: SignedResult,
    ): Promise<string> {
        try {           
            const result = await this.httpClient.post("/api/deploy", deployData, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log("BlockchainGateway.submitDeploy: Deploy result:", result);

            // Parse deploy ID from response
            if (typeof result === "string") {

                const deployIdMatch = /DeployId is:\s*([a-fA-F0-9]+)/.exec(result);

                if (deployIdMatch) {
                    return deployIdMatch[1];
                }
                return result;
            }

            return result.signature || result.deployId || result;
        } catch (error) {
            const message = "BlockchainGateway.submitDeploy: " + getGatewayErrorMessage(error);
            throw new Error(message);
        }
    }
    public gethttpClientUrl(): string {
        return this.httpClient.getBaseUrl() ?? "";
    }
    public async isValidatorActive(): Promise<boolean> {
        try {
            await this.httpClient.get(`/status`);
            return true;
        } catch (error) {
            console.error('BlockchainGateway.isValidatorActive: Node health check failed:', error);
            return false;
        }
    }
}

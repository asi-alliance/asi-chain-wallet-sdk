import BaseHttpClient from "@domains/BaseHttpClient";

export default class ValidatorClient extends BaseHttpClient {
    public submitDeploy(deploy: any) {
        return this.post("/api/deploy", deploy, {
            timeout: this.client.defaults.timeout || 30_000,
        });
    }

    public submitExploratoryDeploy(body: unknown): Promise<any> {
        return this.post("/api/explore-deploy", body);
    }

    /**
     * The node's verdict on a deploy, or a deploy queue's when one serves this
     * validator's port (node-rust #990). An unknown deploy answers `Pending`;
     * a node without the endpoint answers 404.
     */
    public getDeployFinalizationStatus(deploySignature: string): Promise<unknown> {
        return this.get(`/api/deploy-finalization-status/${encodeURIComponent(deploySignature)}`);
    }

    public getStatus() {
        return this.get("/status");
    }
}

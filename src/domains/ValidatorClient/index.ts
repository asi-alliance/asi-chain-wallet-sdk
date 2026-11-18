import BaseHttpClient from "@domains/BaseHttpClient";

export default class ValidatorClient extends BaseHttpClient {
    public submitDeploy(deploy: any) {
        return this.post("/api/deploy", deploy);
    }

    public submitExploratoryDeploy(body: unknown): Promise<any> {
        return this.post("/api/explore-deploy", body);
    }

    // TODO: only the Rust node serves this endpoint; it becomes common to
    // every network once Dev and DevNet both run the Rust node.
    public getDeployFinalizationStatus(
        deploySignature: string,
    ): Promise<unknown> {
        return this.get(
            `/api/deploy-finalization-status/${encodeURIComponent(deploySignature)}`,
        );
    }

    public getStatus() {
        return this.get("/status");
    }
}

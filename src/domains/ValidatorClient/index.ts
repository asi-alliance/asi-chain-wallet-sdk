import BaseHttpClient from "@domains/BaseHttpClient";

// Leave time for an observer result within the default five-second poll interval.
const VERDICT_REQUEST_TIMEOUT_MS = 2_000;

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
            {
                timeout: Math.min(
                    this.client.defaults.timeout || VERDICT_REQUEST_TIMEOUT_MS,
                    VERDICT_REQUEST_TIMEOUT_MS,
                ),
            },
        );
    }

    public getStatus() {
        return this.get("/status");
    }
}

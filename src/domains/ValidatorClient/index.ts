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

    public getStatus() {
        return this.get("/status");
    }
}

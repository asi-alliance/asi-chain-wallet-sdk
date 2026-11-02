import BaseHttpClient from "@domains/BaseHttpClient";

export default class ValidatorClient extends BaseHttpClient {
    public submitDeploy(deploy: any) {
        // The cost-accounted node takes only offered deploys, on this route.
        // return this.post("/api/deploy", deploy);
        return this.post("/api/deploy/offered", {
            deployDataProtoBase64: deploy.deployDataProtoBase64,
        });
    }

    public submitExploratoryDeploy(body: unknown): Promise<any> {
        return this.post("/api/explore-deploy", body);
    }

    public getStatus() {
        return this.get("/status");
    }
}

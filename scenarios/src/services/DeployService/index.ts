import ApiClientManager from "../../domains/ApiClientManager";
import { FAULT_TOLERANCE_THRESHOLD } from "../../utils";

export enum DeployStatus {
    DEPLOYING = "Deploying",
    INCLUDED_IN_BLOCK = "IncludedInBlock",
    FINALIZED = "Finalized",
    CHECK_ERROR = "CheckingError",
}

export type DeployStatusResult =
    | {
          status:
              | DeployStatus.DEPLOYING
              | DeployStatus.INCLUDED_IN_BLOCK
              | DeployStatus.FINALIZED;
      }
    | {
          status: DeployStatus.CHECK_ERROR;
          errorMessage: string;
      };

export default class DeployService {
    private readonly apiClientManager: ApiClientManager;

    constructor(apiClientManager?: ApiClientManager) {
        this.apiClientManager =
            apiClientManager ?? ApiClientManager.getInstance();
    }

    public async getDeploy(deployHash: string): Promise<any> {
        return this.apiClientManager.getObserverClient().getDeploy(deployHash);
    }

    public async isDeployFinalized(deploy: any): Promise<boolean> {
        return deploy.faultTolerance >= FAULT_TOLERANCE_THRESHOLD;
    }

    public async getDeployStatus(
        deployHash: string,
    ): Promise<DeployStatusResult> {
        try {
            const deploy = await this.getDeploy(deployHash);

            if (!deploy?.blockHash) {
                return {
                    status: DeployStatus.DEPLOYING,
                };
            }

            const finalized = await this.isDeployFinalized(deploy);

            return {
                status: finalized
                    ? DeployStatus.FINALIZED
                    : DeployStatus.INCLUDED_IN_BLOCK,
            };
        } catch (error) {
            return {
                status: DeployStatus.CHECK_ERROR,
                errorMessage:
                    error instanceof Error ? error.message : String(error),
            };
        }
    }
}

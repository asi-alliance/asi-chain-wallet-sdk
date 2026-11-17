export interface DeployData {
    term: string;
    phloLimit: number;
    phloPrice: number;
    validAfterBlockNumber: number;
    timestamp: number;
    shardId?: string;
}

export interface IDeployInfo {
    blockHash?: string;
    faultTolerance?: number;
}

export enum DeployStatus {
    DEPLOYING = "Deploying",
    INCLUDED_IN_BLOCK = "IncludedInBlock",
    FINALIZED = "Finalized",
    CHECK_ERROR = "CheckingError",
    /** The node refused the deploy when its deploy queue released it; it never executed. */
    REJECTED = "Rejected",
    /** The deploy's validity window closed without it landing; it never executed. */
    EXPIRED = "Expired",
    /** The deploy executed and failed; its effects, such as a transfer, did not apply. */
    FAILED = "Failed",
}

export type DeployVerdictStatus =
    | DeployStatus.REJECTED
    | DeployStatus.EXPIRED
    | DeployStatus.FAILED;

export type IDeployStatusResult =
    | {
          status:
              | DeployStatus.DEPLOYING
              | DeployStatus.INCLUDED_IN_BLOCK
              | DeployStatus.FINALIZED;
      }
    | {
          status: DeployStatus.CHECK_ERROR;
          errorMessage: string;
      }
    | {
          status: DeployVerdictStatus;
          /** The node's error kind and message, as a deploy queue recorded them. */
          detail?: string;
      };

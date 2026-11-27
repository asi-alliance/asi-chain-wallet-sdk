export type PhloPrice = number | string | bigint;

export interface DeployData {
    term: string;
    phloLimit: number;
    phloPrice: number | string;
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
    REJECTED = "Rejected",
    EXPIRED = "Expired",
    FAILED = "Failed",
}

export const DEPLOY_VERDICT_STATUSES = [
    DeployStatus.REJECTED,
    DeployStatus.EXPIRED,
    DeployStatus.FAILED,
] as const;

export type DeployVerdictStatus = (typeof DEPLOY_VERDICT_STATUSES)[number];

export const DEPLOY_ADMISSION_CODES = [
    "deploy_pool_busy",
    "deploy_admission_busy",
] as const;

export type DeployAdmissionCode = (typeof DEPLOY_ADMISSION_CODES)[number];

export const DEPLOY_REJECTION_CODES = [
    "deploy_too_large",
    "deploy_expired",
    "invalid_deploy_window",
    "validator_not_bonded",
] as const;

export type DeployRejectionCode = (typeof DEPLOY_REJECTION_CODES)[number];

export const DEPLOY_REJECTION_STATUSES: Readonly<
    Record<DeployRejectionCode, number>
> = {
    deploy_too_large: 413,
    deploy_expired: 400,
    invalid_deploy_window: 400,
    validator_not_bonded: 503,
};

export const DEPLOY_QUEUE_REFUSAL_CODES = [
    "deploy_queue_full",
    "node_unavailable",
    "deploy_queue_stopped",
] as const;

export type DeployQueueRefusalCode =
    (typeof DEPLOY_QUEUE_REFUSAL_CODES)[number];

export const DEPLOY_QUEUE_CAUSES = [
    "validator",
    "validator_idle",
    "shard",
    "storage",
    "deployer_share",
] as const;

export type DeployQueueCause = (typeof DEPLOY_QUEUE_CAUSES)[number];

export const DUPLICATE_DEPLOY_CODE: string = "duplicate_deploy";

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
          detail?: string;
      };

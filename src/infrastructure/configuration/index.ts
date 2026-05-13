import { ResubmitConfig } from "../../application/services/Resubmit/types";
export const DEFAULT_AXIOS_TIMEOUT_MS: number = 30000;
export const DEFAULT_PHLO_LIMIT: number = 500000;
export const DEFAULT_RESUBMIT_CONFIG: ResubmitConfig = {
    phloPrice: 1,

    useRandomNode: true,
    deployValiditySeconds: 80,
    nodeSelectionAttempts: 3,
    deployRetries: 3,
      
    deployIntervalSeconds: 5,
    pollingIntervalSeconds: 3,
};
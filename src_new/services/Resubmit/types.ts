export interface ResubmitConfig {
    phloPrice: number;

    useRandomNode: boolean;
    deployValiditySeconds: number;
    nodeSelectionAttempts: number;
    deployRetries: number;

    deployIntervalSeconds: number;
    pollingIntervalSeconds: number;
}

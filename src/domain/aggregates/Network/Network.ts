const networkNames = ["Dev", "DevNet", "MainNet", "TestNet"] as const;

export type NetworkName = typeof networkNames[number];
type NetworkEndpoints = {
    validatorUrl: string | null;
    readOnlyUrl: string | null;
    indexerUrl: string | null;
}

export type Network = {
    name: NetworkName;
    endpoints: NetworkEndpoints;
}
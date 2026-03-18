import Wallet from "@domains/Wallet";

export interface SigningRequest {
    wallet: Wallet;
    data: any;
}

export interface SignedResult {
    data: any;
    deployer: string;
    signature: string;
    sigAlgorithm: string;
}

export type PasswordProvider = () => Promise<string>;

export interface ISigner {
    sign(request: SigningRequest, passwordProvider: PasswordProvider): Promise<SignedResult>;
}

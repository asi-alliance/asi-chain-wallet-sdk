export enum SignerType {
    HD = "HierarchicalDeterministic",
    PK = "PrivateKey",
}

export type PrivateKeySignerCreateOptions = {
    type: SignerType.PK;
};

export type HierarchicalDeterministicCreateOptions = {
    type: SignerType.HD;
};

export default class Signer {
    private readonly type: SignerType;
    readonly secretMaterial: Uint8Array;

    private constructor() {
        this.type = SignerType.PK;
        this.secretMaterial = new Uint8Array();
    }

    public static createPrivateKeySigner(
        options: PrivateKeySignerCreateOptions,
    ): Signer {
        return new Signer();
    }

    public static createHierarchicalDeterministicSigner(
        options: HierarchicalDeterministicCreateOptions,
    ): Signer {
        return new Signer();
    }

    public async signMessage(
        message: any,
        passwordProviderInterface: any,
        metadata: any,
    ): Promise<any> {
        // should return signed message and signature in a single object
    }
}

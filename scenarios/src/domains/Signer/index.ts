export default class Signer {
    private constructor() {}

    public static createPrivateKeySigner(options: any): Signer {
        return new Signer();
    }
    
    public static createHierarchicalDeterministicSigner(options: any): Signer {
        return new Signer();
    }
}

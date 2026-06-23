import { ISigner, SignerFactoryOptions, SignerRestoreOptions, SignerType } from "../domains/Signer";

export interface SignerModule<T extends ISigner> {
    readonly type: SignerType;
    readonly id: string;

    createSigner(options: SignerFactoryOptions): Promise<T>;
    restoreSigner(options: SignerRestoreOptions): Promise<T>;
}

import { ISigner, IHDSigner, SignContext } from "../domains/Signer";
import { SignerService } from "./SignerService";

export class KeyVault {
    constructor(
        private readonly signerService: SignerService,
        private readonly storage: StorageService,
    ) {}

    public async sign(
        signerId: string,
        payload: Uint8Array,
        password: string,
        context?: SignContext,
    ): Promise<Uint8Array> {
        const signer = this.signerService.getSigner(signerId);
        if (!signer) {
            throw new Error(`Signer '${signerId}' is not loaded.`);
        }

        return await signer.sign(payload, password, context);
    }

    public async derive(
        signerId: string,
        password: string,
        derivationPath: string,
    ): Promise<Uint8Array> {
        const signer = this.signerService.getSigner(signerId);
        if (!signer) {
            throw new Error(`Signer '${signerId}' is not loaded.`);
        }

        if (signer.type !== "hd") {
            throw new Error(`Signer '${signerId}' does not support derive().`);
        }

        return await (signer as IHDSigner).derive(derivationPath, password);
    }
}

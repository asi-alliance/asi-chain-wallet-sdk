import { ModuleRegistry } from "../modules/ModuleRegistry";
import { ISigner, IHDSigner, SignerRestoreOptions, SignerFactoryOptions, SignContext } from "../domains/Signer";
import { StorageService } from "./StorageService";
import { SignerModule } from "../modules/SignerModule";

export class SignerService {
    constructor(
        private readonly signers: Map<string, ISigner>,
        private readonly signerRegistry: ModuleRegistry<SignerModule<ISigner>>,
        private readonly storage: StorageService,
    ) {}

    public async registerSignerModule<T extends ISigner>(module: SignerModule<T>): Promise<void> {
        this.signerRegistry.register(module as SignerModule<ISigner>);
    }

    public async createSigner(options: SignerFactoryOptions): Promise<ISigner> {
        const signerModule = this.signerRegistry.resolve(options.type);
        const signer = await signerModule.createSigner(options);

        await this.storage.saveSigner({
            id: signer.id,
            type: signer.type,
            name: signer.name,
            encryptedSecret: signer.getEncryptedSecret(),
            createdAt: Date.now(),
        });

        this.signers.set(signer.id, signer);
        return signer;
    }

    public async restoreSigner(options: SignerRestoreOptions): Promise<ISigner> {
        const signerModule = this.signerRegistry.resolve(options.record.type);
        const signer = await signerModule.restoreSigner(options);

        this.signers.set(signer.id, signer);
        return signer;
    }

    public getSigner(id: string): ISigner | undefined {
        return this.signers.get(id);
    }

    public async deriveAccountAddress(
        signerId: string,
        derivationPath: string,
        password: string,
    ): Promise<string> {
        const signer = this.signers.get(signerId);
        if (!signer) {
            throw new Error(`Signer '${signerId}' not found.`);
        }

        if (signer.type !== "hd") {
            throw new Error(`Signer '${signerId}' does not support derivation.`);
        }

        const derivedKey = await (signer as IHDSigner).derive(
            derivationPath,
            password,
        );
        return btoa(String.fromCharCode(...derivedKey));
    }

    public async listSigners(): Promise<ISigner[]> {
        return Array.from(this.signers.values());
    }
}

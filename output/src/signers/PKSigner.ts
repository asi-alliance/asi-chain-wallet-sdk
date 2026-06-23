import { CryptoService } from "../services/CryptoService";
import { ISigner, SignContext, SignerFactoryOptions, SignerRestoreOptions } from "../domains/Signer";
import { EncryptedSecretMaterial } from "../modules/StorageAdapter";
import { generateRandomId } from "../utils/IdGenerator";

export class PKSigner implements ISigner {
    public readonly id: string;
    public readonly type = "private-key" as const;
    public readonly name: string;
    private readonly encryptedSecret: EncryptedSecretMaterial;

    private constructor(
        id: string,
        name: string,
        encryptedSecret: EncryptedSecretMaterial,
    ) {
        this.id = id;
        this.name = name;
        this.encryptedSecret = encryptedSecret;
    }

    public static async create(options: SignerFactoryOptions): Promise<PKSigner> {
        const encryptedSecret = await CryptoService.sealSecret(
            options.secretMaterial,
            options.password,
        );
        return new PKSigner(options.id ?? generateRandomId(), options.name, encryptedSecret);
    }

    public static async restore(options: SignerRestoreOptions): Promise<PKSigner> {
        return new PKSigner(
            options.record.id,
            options.record.name,
            options.record.encryptedSecret,
        );
    }

    public async sign(
        payload: Uint8Array,
        password: string,
        context?: SignContext,
    ): Promise<Uint8Array> {
        const secret = await CryptoService.openSecret(
            this.encryptedSecret,
            password,
        );
        const message = new Uint8Array([...secret, ...payload]);
        return new Uint8Array(await crypto.subtle.digest("SHA-256", message));
    }

    public getEncryptedSecret(): EncryptedSecretMaterial {
        return this.encryptedSecret;
    }
}

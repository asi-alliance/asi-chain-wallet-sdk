import type Wallet from "@domains/Wallet";
import type SecretsProvider from "@domains/SecretsProvider";
import type { IHDSecret, TDecryptedSecret } from "@domains/SecretsProvider";
import type { ISignerRecord } from "@domains/Signer";
import { WalletTypes } from "@domains/Signer";
import type { ISignerStorageRecord } from "@domains/SignersStorageRepository";
import type { IAccountStorageRecord } from "@domains/AccountsStorageRepository";
import Bip44Path from "@domains/Bip44Path";
import { DuplicateWalletError } from "@domains/CustomError";
import CryptoService from "@services/Crypto";
import KeyDerivationService from "@services/KeyDerivation";
import KeyFingerprintService from "@services/KeyFingerprint";
import StorageManager from "@services/StorageManager";

// TODO(next-major): Remove this service and its call sites once every stored
// HD signer carries the root-path-aware fingerprint from
// KeyFingerprintService.fromHDSecret.
export default class LegacyFingerprintService {
    public static async upgradeSignerFingerprint(
        wallet: Wallet,
    ): Promise<void> {
        const signerId: string = wallet.getSigner().getId();
        const fingerprint: string = wallet.getSigner().getFingerprint();

        const signerRecord: ISignerRecord =
            await StorageManager.getSigner(signerId);

        if (signerRecord.fingerprint === fingerprint) {
            return;
        }

        await StorageManager.updateSigner(signerId, { fingerprint });
    }

    private static async hasSameRootPath(
        signerId: string,
        secret: IHDSecret,
    ): Promise<boolean> {
        const accountRecords: IAccountStorageRecord[] =
            await StorageManager.getAccountsBySignerId(signerId);

        const indexes: number[] = accountRecords
            .map((record: IAccountStorageRecord) => record.index)
            .filter((index: number | null): index is number => index !== null);

        if (!indexes.length) {
            return true;
        }

        const lowestIndex: number = Math.min(...indexes);

        const path: Bip44Path = Bip44Path.parse(secret.rootHDPath.toString());
        path.setIndex(lowestIndex);

        const privateKey: Uint8Array =
            await KeyDerivationService.deriveKeyFromMnemonic(secret.seed, path);
        const fingerprint: string =
            KeyFingerprintService.fromPrivateKey(privateKey);
        privateKey.fill(0);

        return accountRecords
            .filter(
                (record: IAccountStorageRecord) => record.index === lowestIndex,
            )
            .every(
                (record: IAccountStorageRecord) =>
                    record.fingerprint === fingerprint,
            );
    }

    private static async findLegacyHDSigner(
        secret: IHDSecret,
    ): Promise<ISignerStorageRecord | null> {
        const legacySigner: ISignerStorageRecord | null =
            await StorageManager.findSignerByFingerprint(
                await KeyFingerprintService.fromMnemonic(secret.seed),
            );

        if (!legacySigner) {
            return null;
        }

        return (await LegacyFingerprintService.hasSameRootPath(
            legacySigner.id,
            secret,
        ))
            ? legacySigner
            : null;
    }

    public static findSignerBySecret(
        secret: TDecryptedSecret,
    ): Promise<ISignerStorageRecord | null> {
        if ("privateKey" in secret) {
            return Promise.resolve(null);
        }

        return LegacyFingerprintService.findLegacyHDSigner(secret);
    }

    public static async assertWalletIsNotLegacyDuplicate(
        wallet: Wallet,
        passwordProvider: SecretsProvider,
    ): Promise<void> {
        if (wallet.getType() !== WalletTypes.HD) {
            return;
        }

        const secret = (await CryptoService.decryptSignerData(
            wallet.getSigner().getEncryptedSecret(),
            passwordProvider,
        )) as IHDSecret;

        const legacySigner: ISignerStorageRecord | null =
            await LegacyFingerprintService.findLegacyHDSigner(secret);

        if (legacySigner) {
            throw new DuplicateWalletError(legacySigner.id);
        }
    }
}

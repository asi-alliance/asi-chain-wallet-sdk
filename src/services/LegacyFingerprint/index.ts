import type Wallet from "@domains/Wallet";
import type { ISignerRecord } from "@domains/Signer";
import StorageManager from "@services/StorageManager";

// TODO(next-major): Remove this service and its call sites once every stored
// HD signer carries the root-path-aware fingerprint from
// KeyFingerprintService.fromHDSecret.
export default class LegacyFingerprintService {
    public static async upgradeSignerFingerprint(wallet: Wallet): Promise<void> {
        const signerId: string = wallet.getSigner().getId();
        const fingerprint: string = wallet.getSigner().getFingerprint();

        const signerRecord: ISignerRecord =
            await StorageManager.getSigner(signerId);

        if (signerRecord.fingerprint === fingerprint) {
            return;
        }

        await StorageManager.updateSigner(signerId, { fingerprint });
    }
}

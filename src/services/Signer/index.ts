import {
    ISigner,
    SigningRequest,
    PasswordProvider,
    SignedResult,
} from "@domains/Signer";
import { signDeploy } from "@services/Chain";

export default class SignerService implements ISigner {
    async sign(
        request: SigningRequest,
        passwordProvider: PasswordProvider,
    ): Promise<SignedResult> {
        const { wallet, data } = request;

        try {
            const password = await passwordProvider();

            const decryptedPrivateKey = await wallet.decrypt(password);

            const signedDeploy = await signDeploy(data, decryptedPrivateKey);

            return signedDeploy;
        } catch (error: any) {
            const errorMessage = `SignerService.sign: ${(error as Error).message}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }
}

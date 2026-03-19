import KeysManager from "@services/KeysManager";
import BinaryWriter from "@services/BinaryWriter";
import { encodeBase16 } from "@utils/codec";
import { DeployData } from "@domains/Deploy";
import { sign } from "@noble/secp256k1";
import { blake2bHex } from "blakejs";
import {
    SigningRequest,
    PasswordProvider,
    SignedResult,
} from "@domains/Signer";

export default class SignerService {
    public static async sign(
        request: SigningRequest,
        passwordProvider: PasswordProvider,
    ): Promise<SignedResult> {
        const { wallet, data: deployData } = request;

        try {
            const password = await passwordProvider();

            return await wallet.withDecryptedPrivateKey(password, async (signer) => {
                const deploySerialized =
                    this.deployDataProtobufSerialize(deployData);

                const hashed = blake2bHex(deploySerialized, undefined, 32);
                const suitableBytes = Uint8Array.from(Buffer.from(hashed, "hex"));

                const signature = await sign(suitableBytes, signer);
                const publicKey = KeysManager.getPublicKeyFromPrivateKey(signer);

                return {
                    data: {
                        term: deployData.term,
                        timestamp: deployData.timestamp,
                        phloPrice: deployData.phloPrice,
                        phloLimit: deployData.phloLimit,
                        validAfterBlockNumber: deployData.validAfterBlockNumber,
                        shardId: deployData.shardId,
                    },
                    deployer: encodeBase16(publicKey),
                    signature: encodeBase16(signature),
                    sigAlgorithm: "secp256k1",
                };
            });
        } catch (error: any) {
            const errorMessage = `SignerService.sign: ${(error as Error).message}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }

    private static readonly deployDataProtobufSerialize = (
        deployData: DeployData,
    ): Uint8Array => {
        const {
            term,
            timestamp,
            phloPrice,
            phloLimit,
            validAfterBlockNumber,
            shardId = "",
        } = deployData;

        const writer = new BinaryWriter();

        writer.writeString(2, term);
        writer.writeInt64(3, timestamp);
        writer.writeInt64(7, phloPrice);
        writer.writeInt64(8, phloLimit);
        writer.writeInt64(10, validAfterBlockNumber);
        writer.writeString(11, shardId);

        return writer.getResultBuffer();
    };
}

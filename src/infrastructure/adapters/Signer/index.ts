import BinaryWriter from "../BinaryWriter";
import { encodeBase16 } from "../../misc/codec";
import { DeployData } from "../../../application/common/DeployData";
import blakejs from "blakejs";
import { Wallet } from "@domain/";

export interface SigningRequest {
    wallet: Wallet;
    data: any;
}

export interface SignedResult {
    data: any;
    deployer: string;
    signature: string;
    sigAlgorithm: string;
}

export type PasswordProvider = () => Promise<string>;

const { blake2bHex } = blakejs;

export default class SignerService {
    public static async sign(
        request: SigningRequest,
        passwordProvider: PasswordProvider,
    ): Promise<SignedResult> {
        const { wallet, data: deployData } = request;

        try {
            const password = await passwordProvider();

            return await wallet.withSigningCapability(
                password,
                async (signingCapability) => {
                    const deploySerialized =
                        this.deployDataProtobufSerialize(deployData);

                    const hashed = blake2bHex(deploySerialized, undefined, 32);
                    const suitableBytes = Uint8Array.from(
                        Buffer.from(hashed, "hex"),
                    );

                    const signature = await signingCapability.signDigest(
                        suitableBytes,
                    );
                    const publicKey = signingCapability.getPublicKey();

                    return {
                        data: {
                            term: deployData.term,
                            timestamp: deployData.timestamp,
                            phloPrice: deployData.phloPrice,
                            phloLimit: deployData.phloLimit,
                            validAfterBlockNumber:
                                deployData.validAfterBlockNumber,
                            shardId: deployData.shardId,
                        },
                        deployer: encodeBase16(publicKey),
                        signature: encodeBase16(signature),
                        sigAlgorithm: "secp256k1",
                    };
                },
            );
        } catch (error: any) {
            const errorMessage = `SignerService.sign: ${(error as Error).message}`;
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

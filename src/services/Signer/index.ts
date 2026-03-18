import KeysManager from "@services/KeysManager";
import BinaryWriter from "@services/BinaryWriter";
import { decodeBase16, encodeBase16 } from "@utils/codec";
import { DeployData } from "@domains/Deploy";
import { sign } from "@noble/secp256k1";
import { blake2bHex } from "blakejs";
import {
    ISigner,
    SigningRequest,
    PasswordProvider,
    SignedResult,
} from "@domains/Signer";

const signDeploy = async (deployData: DeployData, privateKey: Uint8Array): Promise<SignedResult> => {
    const publicKey = KeysManager.getPublicKeyFromPrivateKey(privateKey);

    const deploySerialized = deployDataProtobufSerialize(deployData);

    const hashed = blake2bHex(deploySerialized, undefined, 32);
    const hashBytes = decodeBase16(hashed);
    const suitableBytes = Uint8Array.from(Buffer.from(hashed, "hex"));;

    const signature = await sign(suitableBytes, privateKey);

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
};

const deployDataProtobufSerialize = (deployData: DeployData): Uint8Array => {
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

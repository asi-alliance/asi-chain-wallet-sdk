import { utils } from "@noble/secp256k1";

const SEED_ID_LENGTH: number = 8;

export default class Seed {
    private id;

    constructor(_seedPhrase: string) {
        this.id = utils.randomBytes(SEED_ID_LENGTH).toString();
    }

    public getId(): string {
        return this.id;
    }
}

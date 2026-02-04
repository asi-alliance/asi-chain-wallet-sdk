import CryptoService, { type EncryptedData } from "@services/Crypto";

export default class EncryptedRecord {
    private encryptedSeedData: EncryptedData;

    static async createAndEncrypt(
        data: string,
        password: string,
    ): Promise<EncryptedRecord> {
        const encryptedData = await CryptoService.encryptWithPassword(
            data,
            password,
        );

        return new EncryptedRecord(encryptedData);
    }

    static createFromEncryptedData(
        encryptedData: EncryptedData,
    ): EncryptedRecord {
        return new EncryptedRecord(encryptedData);
    }

    static createFromStringifiedEncryptedData(data: string): EncryptedRecord {
        return new EncryptedRecord(JSON.parse(data));
    }

    private constructor(encryptedData: EncryptedData) {
        this.encryptedSeedData = encryptedData;
    }

    public async decrypt(password: string): Promise<string> {
        return await CryptoService.decryptWithPassword(
            this.encryptedSeedData,
            password,
        );
    }

    public toString(): string {
        return JSON.stringify(this.encryptedSeedData);
    }
}

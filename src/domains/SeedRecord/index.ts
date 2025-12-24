import { keccak256 } from "js-sha3";
import CryptoService, { type EncryptedData } from "../../services/crypto";

export type Seed = string;
export type SeedRecordRawData = string;
export type StringifiedSeedsMeta = string;

export default class EncryptedSeedRecord {
    private isLocked: boolean;
    private seed: Seed | null;
    private encryptedSeedData: EncryptedData | null;

    static fromRawSeed(seed: Seed): EncryptedSeedRecord {
        const record = new EncryptedSeedRecord();

        record.isLocked = false;
        record.seed = seed;
        record.encryptedSeedData = null;

        return record;
    }

    static fromEncryptedData(seedData: SeedRecordRawData): EncryptedSeedRecord {
        const record = new EncryptedSeedRecord();

        record.isLocked = true;
        record.seed = null;
        record.encryptedSeedData = JSON.parse(seedData);

        return record;
    }

    private constructor() {
        this.isLocked = false;
        this.seed = null;
        this.encryptedSeedData = null;
    }
    
    public isSeedRecordLocked(): boolean {
        return this.isLocked;
    }

    public lock(password: string): void {
        this.ensureUnlocked();

        if (!this.seed) {
            throw new Error("No seed to lock");
        }
        
        this.encryptedSeedData = CryptoService.encryptWithPassword(this.seed, password);

        this.seed = null;
        this.isLocked = true;
    }

    public unlock(password: string): void {
        if (!this.isLocked) {
            return;
        };

        if (!this.encryptedSeedData) {
            throw new Error("SeedRecord was unlocked on undefined encryptedSeedData");
        }

        const decryptedSeed: string = CryptoService.decryptWithPassword(this.encryptedSeedData, password);

        this.seed = decryptedSeed;
        this.isLocked = false;
    }

    public getSeed(): Seed | null {
        this.ensureUnlocked();

        return this.seed;
    }

    public isEmpty(): boolean {
        this.ensureUnlocked();

        return !this.seed;
    }

    public transformToId(): string {
        this.ensureUnlocked();

        if (!this.seed) {
            throw new Error("Unable to generate ID from seed");
        }

        return keccak256(this.seed);
    }

    public toString(): string {
        return JSON.stringify(this.encryptedSeedData);
    }

    private ensureUnlocked(): void {
        if (this.isLocked) {
            throw new Error("Attempted to access locked SeedRecord");
        }
    }
}

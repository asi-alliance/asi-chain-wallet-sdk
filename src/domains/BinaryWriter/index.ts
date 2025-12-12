export default class BinaryWriter {
    private buffer: number[] = [];

    writeString(fieldNumber: number, value: string): void {
        if (value === "") return;

        const key = (fieldNumber << 3) | 2; // field number with wire type 2 (length-delimited)
        this.writeVarint(key);

        const bytes = new TextEncoder().encode(value);
        this.writeVarint(bytes.length);
        this.buffer.push(...Array.from(bytes));
    }

    writeInt64(fieldNumber: number, value: number): void {
        if (value === 0) return;

        const key = (fieldNumber << 3) | 0; // field number with wire type 0 (varint)
        this.writeVarint(key);
        this.writeVarint64(value);
    }

    private writeVarint(value: number): void {
        while (value > 0x7f) {
            this.buffer.push((value & 0x7f) | 0x80);
            value >>>= 7;
        }
        this.buffer.push(value);
    }

    private writeVarint64(value: number): void {
        // For numbers larger than 32 bits, we need to handle them properly
        // JavaScript bitwise operations only work on 32-bit integers
        // This is critical for timestamp values which are often > 2^32
        // Using division instead of >>> ensures correct encoding for 64-bit values
        while (value > 0x7f) {
            this.buffer.push((value & 0x7f) | 0x80);
            // Use division instead of bitwise shift for large numbers
            value = Math.floor(value / 128);
        }
        this.buffer.push(value);
    }

    getResultBuffer(): Uint8Array {
        return new Uint8Array(this.buffer);
    }
}

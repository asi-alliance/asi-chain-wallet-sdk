const DATA_TYPE_SHIFT: number = 3;
const WIRE_TYPE_LENGTH_DELIMITED: number = 2;
const WIRE_TYPE_VARINT: number = 0;
const BITS_SHIFT: number = 7;
const MARK_NEXT_BYTE_AS_CONTINUATION: number = 0x80;
const MAX_BYTE_VALUE: number = 0x7f;

export default class BinaryWriterService {
    private buffer: number[] = [];

    writeBytes(fieldNumber: number, value: Uint8Array): void {
        if (!value.length) return;
        this.writeInteger((fieldNumber << DATA_TYPE_SHIFT) | WIRE_TYPE_LENGTH_DELIMITED);
        this.writeInteger(value.length);
        for (const byte of value) this.buffer.push(byte);
    }

    writeString(fieldNumber: number, value: string): void {
        if (!value) {
            return;
        }

        const key: number =
            (fieldNumber << DATA_TYPE_SHIFT) | WIRE_TYPE_LENGTH_DELIMITED;

        this.writeInteger(key);

        const bytes: Uint8Array = new TextEncoder().encode(value);

        this.writeInteger(bytes.length);

        this.buffer.push(...Array.from(bytes));
    }

    writeInt64(fieldNumber: number, value: number): void {
        if (!Number.isSafeInteger(value)) {
            throw new RangeError("Integer field must be a safe integer");
        }
        if (!value) {
            return;
        }

        const key: number = (fieldNumber << DATA_TYPE_SHIFT) | WIRE_TYPE_VARINT;

        this.writeInteger(key);
        this.writeInteger64(value);
    }

    private writeInteger(value: number): void {
        while (value > MAX_BYTE_VALUE) {
            this.buffer.push(
                (value & MAX_BYTE_VALUE) | MARK_NEXT_BYTE_AS_CONTINUATION,
            );

            value >>>= BITS_SHIFT;
        }

        this.buffer.push(value);
    }

    private writeInteger64(value: number): void {
        let integer = BigInt.asUintN(64, BigInt(value));
        while (integer > 127n) {
            this.buffer.push(Number(integer & 127n) | MARK_NEXT_BYTE_AS_CONTINUATION);
            integer >>= 7n;
        }
        this.buffer.push(Number(integer));
    }

    getResultBuffer(): Uint8Array {
        return new Uint8Array(this.buffer);
    }
}

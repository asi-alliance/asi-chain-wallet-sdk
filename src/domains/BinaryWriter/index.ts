const DATA_TYPE_SHIFT: number = 3;
const WIRE_TYPE_LENGTH_DELIMITED: number = 2;
const WIRE_TYPE_VARINT: number = 0;
const BITS_SHIFT: number = 7;
const MARK_NEXT_BYTE_AS_CONTINUATION: number = 0x80;
const MAX_BYTE_VALUE: number = 0x7f;
const INT64_BITS: number = 64;
const MAX_BYTE_VALUE_BIGINT: bigint = BigInt(MAX_BYTE_VALUE);
const BITS_SHIFT_BIGINT: bigint = BigInt(BITS_SHIFT);

export default class BinaryWriterService {
    private buffer: number[] = [];

    writeBytes(fieldNumber: number, value: Uint8Array): void {
        if (!value.length) {
            return;
        }

        const key: number =
            (fieldNumber << DATA_TYPE_SHIFT) | WIRE_TYPE_LENGTH_DELIMITED;

        this.writeInteger(key);
        this.writeInteger(value.length);

        this.buffer.push(...Array.from(value));
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
        let integer: bigint = BigInt.asUintN(INT64_BITS, BigInt(value));

        while (integer > MAX_BYTE_VALUE_BIGINT) {
            this.buffer.push(
                Number(integer & MAX_BYTE_VALUE_BIGINT) |
                    MARK_NEXT_BYTE_AS_CONTINUATION,
            );

            integer >>= BITS_SHIFT_BIGINT;
        }

        this.buffer.push(Number(integer));
    }

    getResultBuffer(): Uint8Array {
        return new Uint8Array(this.buffer);
    }
}

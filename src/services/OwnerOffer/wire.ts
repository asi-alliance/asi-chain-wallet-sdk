// Port of models/src/rust/phlo_wire.rs (f1r3node-rust fe6cce76e).
//
// A field is its length as a big-endian u64, then its bytes. A record is a
// sequence of fields. The limits bound one field and the whole record.

import {
    OwnerOfferError,
    concatBytes,
    readUnsignedBE,
    u64be,
} from "./bytes";

export interface PhloWireLimits {
    totalBytes: number;
    fieldBytes: number;
}

export const PhloWireErrorMessage = {
    LIMIT_EXCEEDED: "phlo wire data exceeds its byte limit",
    TRUNCATED: "phlo wire data ends inside a field",
    TRAILING_BYTES: "phlo wire data contains trailing bytes",
} as const;

export const nestedLimits = (limits: PhloWireLimits): PhloWireLimits => ({
    totalBytes: limits.fieldBytes,
    fieldBytes: limits.fieldBytes,
});

export class PhloWireEncoder {
    private readonly limits: PhloWireLimits;
    private readonly parts: Uint8Array[] = [];
    private length: number = 0;

    constructor(limits: PhloWireLimits) {
        this.limits = limits;
    }

    public bytes(value: Uint8Array): void {
        if (value.length > this.limits.fieldBytes) {
            throw new OwnerOfferError(PhloWireErrorMessage.LIMIT_EXCEEDED);
        }

        this.append(u64be(value.length), value);
    }

    public asBytes(): Uint8Array {
        return concatBytes(this.parts);
    }

    private append(prefix: Uint8Array, payload: Uint8Array): void {
        const length: number = this.length + prefix.length + payload.length;

        if (length > this.limits.totalBytes) {
            throw new OwnerOfferError(PhloWireErrorMessage.LIMIT_EXCEEDED);
        }

        this.parts.push(prefix, payload);
        this.length = length;
    }
}

export const encodeWireFields = (
    fields: ReadonlyArray<Uint8Array>,
    limits: PhloWireLimits,
): Uint8Array => {
    const encoder: PhloWireEncoder = new PhloWireEncoder(limits);

    for (let index = 0; index < fields.length; index += 1) {
        encoder.bytes(fields[index]);
    }

    return encoder.asBytes();
};

export class PhloWireDecoder {
    private readonly input: Uint8Array;
    private readonly limits: PhloWireLimits;
    private position: number = 0;

    constructor(input: Uint8Array, limits: PhloWireLimits) {
        if (input.length > limits.totalBytes) {
            throw new OwnerOfferError(PhloWireErrorMessage.LIMIT_EXCEEDED);
        }

        this.input = input;
        this.limits = limits;
    }

    public bytes(): Uint8Array {
        if (this.input.length - this.position < 8) {
            throw new OwnerOfferError(PhloWireErrorMessage.TRUNCATED);
        }

        const count: number = readUnsignedBE(
            this.input.subarray(this.position, this.position + 8),
        );

        if (count < 0 || count > this.limits.fieldBytes) {
            throw new OwnerOfferError(PhloWireErrorMessage.LIMIT_EXCEEDED);
        }

        const start: number = this.position + 8;
        const end: number = start + count;

        if (end > this.input.length) {
            throw new OwnerOfferError(PhloWireErrorMessage.TRUNCATED);
        }

        this.position = end;

        return this.input.subarray(start, end);
    }

    public finish(): void {
        if (this.position !== this.input.length) {
            throw new OwnerOfferError(PhloWireErrorMessage.TRAILING_BYTES);
        }
    }
}

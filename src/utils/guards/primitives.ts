import {
    NON_NEGATIVE_DECIMAL_REGEX,
    NON_NEGATIVE_INTEGER_REGEX,
} from "@utils/constants";

export const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null;
};

export const isValidByte = (value: unknown): value is number => {
    return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 255
    );
};

export const isByteIndexedRecord = (
    value: object,
): value is Record<string, number> => {
    return Object.entries(value).every(
        ([key, byte]: [string, unknown], position: number) =>
            key === String(position) && isValidByte(byte),
    );
};

export const isValueInConst = <const T extends readonly string[]>(
    value: unknown,
    values: T,
): value is T[number] => {
    return typeof value === "string" && values.includes(value);
};

export const isSerializedAmount = (value: unknown): value is string => {
    return typeof value === "string" && NON_NEGATIVE_DECIMAL_REGEX.test(value);
};

export const isAtomicAmount = (value: unknown): value is string => {
    return typeof value === "string" && NON_NEGATIVE_INTEGER_REGEX.test(value);
};

export const isRecordWithMessage = (
    value: unknown,
): value is { message: string } => {
    return (
        isRecord(value) &&
        "message" in value &&
        typeof value.message === "string" &&
        value.message.trim().length > 0
    );
};

export const isErrorWithMessage = (value: unknown): value is Error => {
    return isRecordWithMessage(value) && value instanceof Error;
};

export const isPromiseLike = (
    value: unknown,
): value is PromiseLike<unknown> => {
    return (
        isRecord(value) && "then" in value && typeof value.then === "function"
    );
};
export const isIntegerInRange = (
    value: number,
    min: number,
    max: number,
): boolean => {
    return Number.isInteger(value) && value >= min && value <= max;
};

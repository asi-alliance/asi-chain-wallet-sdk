import { GasFee } from "@utils/constants";

export default class FeeService {
    public static generateRandomGasFee = (): string => {
        const variation = (Math.random() - 0.5) * 2 * GasFee.VARIATION_RANGE;
        const randomFee = GasFee.BASE_FEE * (1 + variation);

        return randomFee.toFixed(4);
    };

    public static getGasFeeAsNumber = (): number => {
        return GasFee.BASE_FEE;
    };

    public static formatGasFee = (fee?: string): string => {
        const feeValue = fee || this.generateRandomGasFee();

        return `${feeValue} ${GasFee.LABEL}`;
    };
}

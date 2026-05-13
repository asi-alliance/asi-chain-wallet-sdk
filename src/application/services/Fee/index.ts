import { GasFeeVO } from "@/domain/aggregates/Fee/GasFeeVO";
import { randomBigInt } from "@/infrastructure/misc";
import { GAS_FEE } from "@/domain/constants";
import { IGasFeeView, mapGasFeeToView } from "./GasFeeView";

export class FeeService {
    private static generateRandomFakeGasFee = (): bigint => {
        const fakeFee = randomBigInt(GAS_FEE.MIN, GAS_FEE.MAX);
        return fakeFee;
    };

    public static getGasFeeVO() {
        return new GasFeeVO(this.generateRandomFakeGasFee(), GAS_FEE.MIN, GAS_FEE.MAX);
    }
    public static getGasFeeView(gasFeeVO: GasFeeVO = FeeService.getGasFeeVO()): IGasFeeView {
        return mapGasFeeToView(gasFeeVO);
    }
}

export {type IGasFeeView} from "./GasFeeView";

import { GasFeeVO } from "@domains/Fee/GasFeeVO";
import { randomBigInt } from "@utils";
import { GAS_FEE } from "@utils/constants";
import { IGasFeeView, mapGasFeeToView } from "./GasFeeView";

export default class FeeService {
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
import { createContext, useContext } from "react";
import type { UseSdkValue } from "./useSdk";

type SdkContextValue = UseSdkValue;

const SdkContext = createContext({} as SdkContextValue);

const useSdkContext = () => useContext(SdkContext);

export type { SdkContextValue };
export { useSdkContext };
export default SdkContext;

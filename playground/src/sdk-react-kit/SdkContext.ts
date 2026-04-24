import { createContext, useContext } from "react";
import type { UseSdkValue } from "./hooks/useSdk";

type SdkContextValue = UseSdkValue;

const SdkContext = createContext({} as SdkContextValue);

const useSdkContext = () => useContext(SdkContext);

export type { SdkContextValue };
export { SdkContext, useSdkContext };

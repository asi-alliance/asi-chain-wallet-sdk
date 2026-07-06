import {
    createContext,
    useContext,
    type Dispatch,
    type SetStateAction,
} from "react";
import type { ModalProps, Modals } from "./meta";

type ModalState = {
    type: Modals | null;
    props?: ModalProps;
};

type ApplicationContextValue = {
    modalState: ModalState;
    setModalState: Dispatch<SetStateAction<ModalState>>;
    withLoader: (method: (...params: unknown[]) => void) => void;
};

const ApplicationContext = createContext({} as ApplicationContextValue);

const useAppContext = () => useContext(ApplicationContext);

export type { ApplicationContextValue, ModalState };
export { useAppContext };
export default ApplicationContext;

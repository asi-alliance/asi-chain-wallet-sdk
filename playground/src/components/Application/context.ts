import { createContext, useContext } from "react";

const ApplicationContext = createContext({} as any);

const useAppContext = () => useContext(ApplicationContext);

export { useAppContext };
export default ApplicationContext;

import { useState } from "react";

const useLoader = () => {
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const withLoader = (method: (...params: unknown[]) => void) => {
        setIsLoading(true);
        
        requestIdleCallback(() => {
            method();
            setIsLoading(false);
        });
    };

    return {
        isLoading,
        setIsLoading,
        withLoader,
    };
};

export default useLoader;

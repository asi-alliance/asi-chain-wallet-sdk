import { useState } from "react";

const useLoader = () => {
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const withLoader = (method: (...params: unknown[]) => void) => {
        setIsLoading(true);

        // requestIdleCallback(() => {
        //     method();
        //     setIsLoading(false);
        // });

        setTimeout(() => {
            // add timeout to postpone operation to the next render
            method();
            setIsLoading(false);
        }, 10);
    };

    return {
        isLoading,
        setIsLoading,
        withLoader,
    };
};

export default useLoader;

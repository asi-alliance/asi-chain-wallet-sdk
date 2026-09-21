import { useCallback, useState } from "react";

const useLoader = () => {
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const withLoader = useCallback(
        async <T>(method: () => T | Promise<T>): Promise<T> => {
            setIsLoading(true);

            try {
                return await method();
            } finally {
                setIsLoading(false);
            }
        },
        [],
    );

    return {
        isLoading,
        setIsLoading,
        withLoader,
    };
};

export default useLoader;

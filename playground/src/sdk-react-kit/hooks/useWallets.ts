import { useMemo, useState } from "react";
import { useSdkContext } from "../SdkContext";

export const useWallets = () => {
      const sdk = useSdkContext();
      const { vault } = sdk;
      const [lastIndex, setLastIndex] = useState<number | null>(null);
      const wallets = useMemo(() => {
          let lastIndexLocal: number | null = null;
  
          if (!vault) {
              return { privateKeyWallets: [], mnemonicWallets: [] };
          }
  
          const wallets = vault.getWallets();
  
          const privateKeyWallets = wallets.filter(
              (wallet) => wallet.getIndex() === null
          );
          const mnemonicWallets = wallets.filter((wallet) => {
              if (typeof wallet.getIndex() === "number") {
                  lastIndexLocal = Math.max(
                      lastIndexLocal === null ? -1 : lastIndexLocal,
                      wallet.getIndex() as number
                  );
              } else {
                  return false;
              }
              return true;
          });
  
          setLastIndex(lastIndexLocal);
  
          return { privateKeyWallets, mnemonicWallets };
      }, [vault]);
      
      const flatWallets = useMemo(() => {
        return [
          ...wallets.mnemonicWallets,
          ...wallets.privateKeyWallets,
        ]
      }, [wallets]);
  return {wallets, lastIndex, flatWallets};
}
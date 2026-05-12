import { useEffect, useMemo, useState } from "react";
import {Client, Wallet} from "asi-wallet-sdk";


const updateWallets = (sdkClient: Client, setWallets: React.Dispatch<{mnemonicWallets: Wallet[]; privateKeyWallets: Wallet[]}>, setLastIndex: React.Dispatch<number>) => {
    let lastIndexLocal: number | null = null;
    const wallets = sdkClient.vault.getWallets();
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

    setWallets({ mnemonicWallets, privateKeyWallets});
};


export const walletsSlice = (sdkClient: Client) => {
      const [wallets, setWallets] = useState({mnemonicWallets: [], privateKeyWallets: []});
      const [lastIndex, setLastIndex] = useState<number | null>(null);

      useEffect(() => {
        if(sdkClient) {
            sdkClient.uiEventDispatcher.onVaultChanged = () => {
                updateWallets(sdkClient, setWallets, setLastIndex);
            }
        }
        return () => {
            if(sdkClient) {
                sdkClient.uiEventDispatcher.onVaultChanged = null;
            }
        }
      }, [sdkClient]);

      
      const flatWallets = useMemo(() => {
        return [
          ...(wallets.mnemonicWallets ?? []),
          ...(wallets.privateKeyWallets ?? []),
        ]
      }, [wallets]);
  return {wallets, lastIndex, flatWallets};
}
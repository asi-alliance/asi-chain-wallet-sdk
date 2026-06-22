import { TCreateHDWalletOptions } from "@domains/Wallet";

export function getHDWalletOptions(
    customHDPath: string | null,
    depth: number | null,
): TCreateHDWalletOptions {
    return !customHDPath
        ? {
              index: depth ?? 0,
          }
        : {
              customHDPath: customHDPath,
          };
}

import WalletsPage from "@pages/WalletsPage";
import {PATHS} from "./paths";
import TxHistoryPage from "@pages/TxHistoryPage";
export const PAGE_ROUTES = [
    {
        path: PATHS.WALLETS_PATH,
        label: "Wallets",
        Page: WalletsPage,
    },
    {
        path: PATHS.TX_HISTORY_PATH,
        label: "Tx History",
        Page: TxHistoryPage,
    },
] as const;
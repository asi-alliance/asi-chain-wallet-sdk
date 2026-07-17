import WalletsPage from "@pages/WalletsPage";
import {PATHS} from "./paths";
import TxHistoryPage from "@pages/TxHistoryPage";
import NetworksPage from "@pages/NetworksPage";
export const PAGE_ROUTES = [
    {
        path: PATHS.WALLETS_PATH,
        label: "Wallets",
        Page: WalletsPage,
    },
    {
        path: PATHS.TX_HISTORY_PATH,
        label: "TxHistory",
        Page: TxHistoryPage,
    },
    {
        path: PATHS.NETWORKS_PATH,
        label: "Networks",
        Page: NetworksPage,
    },
] as const;
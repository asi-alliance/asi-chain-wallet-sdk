import WalletsPage from "@pages/WalletsPage";
import {PATHS} from "./paths";
import TxHistoryPage from "@pages/TxHistoryPage";
import NetworksPage from "@pages/NetworksPage";
import DeployPage from "@pages/DeployPage";
import ReservationsPage from "@pages/ReservationsPage";
import DeployUtilsPage from "@pages/DeployUtilsPage";
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
    {
        path: PATHS.DEPLOY_PATH,
        label: "Deploy",
        Page: DeployPage,
    },
    {
        path: PATHS.DEPLOY_UTILS_PATH,
        label: "Deploy Utils",
        Page: DeployUtilsPage,
    },
    {
        path: PATHS.RESERVATIONS_PATH,
        label: "Reservations",
        Page: ReservationsPage,
    },
] as const;
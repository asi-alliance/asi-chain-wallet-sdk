import ReservationAdapter from "@domains/ReservationAdapter";
import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import DisposableItemManager from "@services/DisposableItemManager";
import { NetworkId } from "@domains/Network";
import { TReservationsByWallet } from "@domains/Transaction";
import { ITransactionReservationsManagerOptions } from "@services/TransactionReservationsManager";

class ReservationAdapterManager extends DisposableItemManager<ReservationAdapter> {
    public async create(
        wallet: Wallet,
        passwordProvider?: SecretsProvider,
        reservationsManagerOptions?: ITransactionReservationsManagerOptions,
    ): Promise<ReservationAdapter> {
        const reservationAdapter: ReservationAdapter =
            await ReservationAdapter.create(
                wallet,
                passwordProvider,
                reservationsManagerOptions,
            );
        super.add(wallet.getId(), reservationAdapter);

        return reservationAdapter;
    }

    public getReservationsByWallet(): TReservationsByWallet {
        const reservationsByWallet: TReservationsByWallet = {};

        for (const [walletId, reservationAdapter] of this.getMap()) {
            reservationsByWallet[walletId] =
                reservationAdapter.getReservations();
        }

        return reservationsByWallet;
    }

    public async removeNetworkReservations(
        networkId: NetworkId,
    ): Promise<void> {
        await Promise.all(
            this.getAll().map((reservationAdapter: ReservationAdapter) =>
                reservationAdapter.removeNetworkReservations(networkId),
            ),
        );
    }
}

export default ReservationAdapterManager;

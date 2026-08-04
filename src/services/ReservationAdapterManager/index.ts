import ReservationAdapter from "@domains/ReservationAdapter";
import Wallet from "@domains/Wallet";
import SecretsProvider from "@domains/SecretsProvider";
import DisposableItemManager from "@services/DisposableItemManager";
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
}

export default ReservationAdapterManager;

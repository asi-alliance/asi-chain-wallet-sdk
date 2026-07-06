import ReservationAdapter from "@domains/ReservationAdapter";
import SecretsProvider from "@domains/SecretsProvider";
import Wallet from "@domains/Wallet";
import DisposableItemManager from "@services/DisposableItemManager";

class ReservationAdapterManager extends DisposableItemManager<ReservationAdapter> {
    public async create(
        wallet: Wallet,
        passwordProvider: SecretsProvider,
    ): Promise<ReservationAdapter> {
        const reservationAdapter: ReservationAdapter =
            await ReservationAdapter.create(wallet, passwordProvider);
        super.add(wallet.getId(), reservationAdapter);

        return reservationAdapter;
    }
}

export default ReservationAdapterManager;

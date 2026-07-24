import ReservationAdapter from "@domains/ReservationAdapter";
import Wallet from "@domains/Wallet";
import DisposableItemManager from "@services/DisposableItemManager";

class ReservationAdapterManager extends DisposableItemManager<ReservationAdapter> {
    public async create(wallet: Wallet): Promise<ReservationAdapter> {
        const reservationAdapter: ReservationAdapter =
            await ReservationAdapter.create(wallet);
        super.add(wallet.getId(), reservationAdapter);

        return reservationAdapter;
    }
}

export default ReservationAdapterManager;

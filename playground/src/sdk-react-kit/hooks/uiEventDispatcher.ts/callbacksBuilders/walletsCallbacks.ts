export function walletsCallbacks(walletsSetters) {
    return {
        onVaultChanged() {
            walletsSetters.bumpVaultVersion();
        }
    }
}
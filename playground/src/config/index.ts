const NetworksString = import.meta.env.VITE_NETWORKS;

if (!NetworksString) {
    throw new Error(
        "Application could not be initialized: 'Networks' .env value is not provided"
    );
}

const Networks = JSON.parse(NetworksString);

export { Networks };

import path from "path";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
    plugins: [nodePolyfills()],

    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@services": path.resolve(__dirname, "./src/services"),
            "@domains": path.resolve(__dirname, "./src/domains"),
            "@config": path.resolve(__dirname, "./src/config"),
            "@utils": path.resolve(__dirname, "./src/utils"),
            "asi-wallet-sdk": path.resolve(__dirname, "./dist"),
        },
    },

    build: {
        lib: {
            entry: path.resolve(__dirname, "src/index.ts"),
            name: "asi-wallet-sdk",
            formats: ["es", "cjs", "umd"],
            fileName: (format) => `index.${format}.js`,
        },
        rollupOptions: {
            external: [
                "axios",
                "bip32",
                "bip39",
                "blakejs",
                "bs58",
                "crypto-js",
                "elliptic",
                "js-sha3",
                "tiny-secp256k1",
            ],
            output: {
                globals: {
                    axios: "axios",
                    bs58: "bs58",
                    blakejs: "blakejs",
                    elliptic: "elliptic",
                    bip39: "bip39",
                    bip32: "bip32",
                    "tiny-secp256k1": "tinysecp",
                    "js-sha3": "jsSha3",
                },
            },
        },
    },
});

import path from "path";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react(), wasm(), nodePolyfills()],
    resolve: {
        alias: {
            "@api": path.resolve(__dirname, "./src/api"),
            "@components": path.resolve(__dirname, "./src/components"),
            "@context": path.resolve(__dirname, "./src/context"),
            "@domains": path.resolve(__dirname, "./src/domains"),
            "@hooks": path.resolve(__dirname, "./src/hooks"),
            "@router": path.resolve(__dirname, "./src/router"),
            "@pages": path.resolve(__dirname, "./src/pages"),
            "@layouts": path.resolve(__dirname, "./src/layouts"),
            "@services": path.resolve(__dirname, "./src/services"),
            "@utils": path.resolve(__dirname, "./src/utils"),
            "@data": path.resolve(__dirname, "./src/data"),
            "@store": path.resolve(__dirname, "./src/store"),
            "asi-wallet-sdk": path.resolve(__dirname, "../dist")
        },
    },
});

import fs from "fs";
import path from "path";
import dts from "rollup-plugin-dts";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { builtinModules } from "module";

const pkg = JSON.parse(
    fs.readFileSync(new URL("./package.json", import.meta.url)),
);

const external = [...Object.keys(pkg.dependencies || {}), ...builtinModules];

const aliasEntries = {
    "@services": path.resolve("src_new/services"),
    "@domains": path.resolve("src_new/domains"),
    "@config": path.resolve("src_new/config"),
    "@utils": path.resolve("src_new/utils"),
    "@scripts": path.resolve("src_new/scripts"),
    "@fabrics": path.resolve("src_new/fabrics"),
};

export default [
    {
        input: "src_new/index.ts",
        external,
        plugins: [
            alias({ entries: aliasEntries }),
            resolve({ preferBuiltins: true }),
            commonjs(),
            typescript({
                tsconfig: "./tsconfig.build.json",
                declaration: false,
            }),
            terser(),
        ],
        output: [
            { file: "dist/index.esm.js", format: "esm", sourcemap: true },
            {
                file: "dist/index.cjs",
                format: "cjs",
                sourcemap: true,
                exports: "named",
                interop: "auto",
            },
        ],
    },
    {
        input: "src_new/index.ts",
        plugins: [alias({ entries: aliasEntries }), dts()],
        output: [{ file: "dist/index.d.ts", format: "es" }],
    },
];

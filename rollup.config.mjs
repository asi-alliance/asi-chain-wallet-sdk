import fs from "fs";
import path from "path";
import dts from "rollup-plugin-dts";
import terser from "@rollup/plugin-terser";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import alias from "@rollup/plugin-alias";
import { builtinModules } from "module";

const pkg = JSON.parse(
    fs.readFileSync(new URL("./package.json", import.meta.url)),
);

const external = [...Object.keys(pkg.dependencies || {}), ...builtinModules];

const aliasEntries = {
    "@services": path.resolve("src/services"),
    "@domains": path.resolve("src/domains"),
    "@config": path.resolve("src/config"),
    "@utils": path.resolve("src/utils"),
};

export default [
    {
        input: "src/index.ts",
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
            { file: pkg.module || "dist/index.esm.js", format: "esm" },
            { file: pkg.main || "dist/index.cjs.js", format: "cjs" },
        ],
    },
    {
        input: "src/index.ts",
        plugins: [alias({ entries: aliasEntries }), dts()],
        output: [{ file: pkg.types || "dist/index.d.ts", format: "es" }],
    },
];

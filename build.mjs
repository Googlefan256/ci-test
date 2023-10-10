import { build } from "esbuild";
import { minify } from "terser";
import { writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

if (existsSync("dist")) {
    await rm("dist", { recursive: true });
}

const shared = {
    bundle: true,
    entryPoints: ["src/index.ts"],
    logLevel: "info",
    minify: true,
    sourcemap: false,
};

await build({
    ...shared,
    outfile: "dist/index.js",
    format: "cjs",
    platform: "node",
});

const cjs = await minify(
    await readFile("dist/index.js", { encoding: "utf-8" }),
    {
        mangle: true,
        compress: true,
        format: {
            comments: false,
        },
    },
);

if (cjs.code) {
    await writeFile("dist/index.js", cjs.code);
}

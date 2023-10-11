import { redBright, greenBright } from "chalk";
import { getInput, getBooleanInput } from "@actions/core";
import { exec } from "@actions/exec";
import { mkdirP, mv, rmRF, cp } from "@actions/io";
import { spawn } from "child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { saveCache, restoreCache } from "@actions/cache";
import { type } from "node:os";

const paths = [
    "target/",
    "~/.cargo/bin/",
    "~/.cargo/registry/index/",
    "~/.cargo/registry/cache/",
    "~/.cargo/git/db/",
];

function trygetBooleanInput(n: string) {
    try {
        return getBooleanInput(n);
    } catch {
        return false;
    }
}

function error(msg: string) {
    console.error(`${redBright("ERROR")}: ${msg}`);
    return process.exit(1);
}

function info(msg: string) {
    console.log(`${greenBright("INFO")}: ${msg}`);
}

function splitArgs() {
    return getInput("package").split(",");
}

async function $(
    cmd: string,
    env?: Record<string, string> | undefined,
    shell = false,
): Promise<undefined> {
    if (shell) {
        const cp = spawn(cmd, { stdio: "inherit", env, shell: true });
        return new Promise((resolve) => {
            cp.once("exit", (code) => {
                if (code !== 0) {
                    error(`command didn't exit successfully(${code}): ${cmd}`);
                }
                return resolve(undefined);
            });
        });
    }
    const code = await exec(cmd, undefined, {
        env,
    });
    if (code !== 0) {
        error(`command didn't exit successfully(${code}): ${cmd}`);
    }
    return undefined;
}

async function doInstallRust() {
    const doInstall = trygetBooleanInput("install-rustup");
    if (doInstall) {
        const output = "install-rust-arandompath.sh";
        await $(`curl https://sh.rustup.rs -o ${output}`);
        await $(`sh ${output} -y`);
        await $(`rm ${output}`);
    }
}

let openssl_dir: string | null = null;
let openssl_lib_dir: string | null = null;

async function doInstallOpenssl() {
    const base = resolve(process.env.GITHUB_WORKSPACE || __dirname);
    function path(j?: string) {
        if (j) {
            return join(base, "target", j);
        } else {
            return join(base, "target");
        }
    }
    const doInstall = trygetBooleanInput("install-openssl");
    if (doInstall) {
        if (!existsSync(path("openssl-aarch64"))) {
            await mkdirP(path());
            await $(
                "curl -O http://security.debian.org/debian-security/pool/updates/main/o/openssl/libssl-dev_1.1.1n-0+deb10u6_arm64.deb",
            );
            await $(
                "ar p libssl-dev_1.1.1n-0+deb10u6_arm64.deb data.tar.xz | tar Jxvf -",
                undefined,
                true,
            );
            await rmRF("libssl-dev_1.1.1n-0+deb10u6_arm64.deb");
            await mv("usr", path("openssl-aarch64"));
            await cp(
                path(
                    "openssl-aarch64/include/aarch64-linux-gnu/openssl/opensslconf.h",
                ),
                path("openssl-aarch64/include/openssl"),
            );
            info(`openssl installed`);
        }
        openssl_dir = path("openssl-aarch64");
        openssl_lib_dir = path("openssl-aarch64/lib/aarch64-linux-gnu");
    }
}
const restoreKeys = [`${type()}-CrossBuild-`];

async function main() {
    const willCache = getBooleanInput("cache");
    if (willCache) {
        const hashFiles = getInput("cache-key");
        const key = `${type()}-CrossBuild-${hashFiles}`;
        const _cacheKey = await restoreCache(paths, key, restoreKeys);
    }
    await doInstallRust();
    await doInstallOpenssl();
    const packages = splitArgs();
    if (!packages.length) {
        return error("no build binary specified");
    }
    await $("sudo apt-get update");
    await $(
        "sudo apt-get install gcc-aarch64-linux-gnu gcc-x86-64-linux-gnu -y",
    );
    await $(
        "rustup target add aarch64-unknown-linux-gnu x86_64-unknown-linux-gnu",
    );
    for (const pkg of packages) {
        let env = undefined;
        if (openssl_dir && openssl_lib_dir) {
            env = Object.assign(process.env, {
                AARCH64_UNKNOWN_LINUX_GNU_OPENSSL_DIR: openssl_dir,
                AARCH64_UNKNOWN_LINUX_GNU_OPENSSL_LIB_DIR: openssl_lib_dir,
            }) as Record<string, string>;
        }
        await $(
            `cargo build --target aarch64-unknown-linux-gnu --release --config target.aarch64-unknown-linux-gnu.linker='aarch64-linux-gnu-gcc' --package ${pkg}`,
            env,
        );
        await $(
            `cargo build --target x86_64-unknown-linux-gnu --release --config target.x86_64-unknown-linux-gnu.linker='x86_64-linux-gnu-gcc' --package ${pkg}`,
        );
    }
    rmRF(".out");
    mkdirP(".out");
    mkdirP(".out/aarch64");
    mkdirP(".out/x86-64");
    for (const pkg of packages) {
        await $(
            `aarch64-linux-gnu-strip target/aarch64-unknown-linux-gnu/release/${pkg} -o .out/aarch64/${pkg}`,
        );
        await $(
            `x86_64-linux-gnu-strip target/x86_64-unknown-linux-gnu/release/${pkg} -o .out/x86-64/${pkg}`,
        );
    }
    if (willCache) {
        const hashFiles = getInput("cache-key");
        const key = `${type()}-CrossBuild-${hashFiles}`;
        const _cacheId = await saveCache(paths, key);
    }
}

main();

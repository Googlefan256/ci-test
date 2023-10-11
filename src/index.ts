import { redBright, greenBright } from "chalk";
import { getInput, getBooleanInput } from "@actions/core";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { exec } from "@actions/exec";

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
    env?: Record<string, string>,
): Promise<undefined> {
    const code = await exec(cmd, undefined, {
        env,
    });
    if (code !== 0) {
        error(`command didn't exit successfully(${code}): ${cmd}`);
    }
    return undefined;
}

async function doInstallRust() {
    const doInstall = getBooleanInput("install-rustup");
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
    const doInstall = getBooleanInput("install-openssl");
    if (doInstall) {
        const dir = process.env.GITHUB_WORKSPACE || __dirname;
        if (!existsSync(`${join(resolve(dir), "target/openssl-aarch64")}`)) {
            await $(`mkdir -p ${join(resolve(dir), "target")}`);
            await $(
                "curl -O http://security.debian.org/debian-security/pool/updates/main/o/openssl/libssl-dev_1.1.1n-0+deb10u6_arm64.deb",
            );
            await $(
                "ar p libssl-dev_1.1.1n-0+deb10u6_arm64.deb  data.tar.xz | tar Jxvf -",
            );
            await $("rm -rf libssl-dev_1.1.1n-0+deb10u6_arm64.deb");
            await $(`mv usr ${join(resolve(dir), "target/openssl-aarch64")}`);
            await $(
                `cp ${join(
                    resolve(dir),
                    "target/openssl-aarch64/include/aarch64-linux-gnu/openssl/opensslconf.h",
                )} ${join(
                    resolve(dir),
                    "target/openssl-aarch64/include/openssl",
                )}`,
            );
            openssl_dir = join(resolve(dir), "target/openssl-aarch64");
            openssl_lib_dir = join(
                resolve(dir),
                "target/openssl-aarch64/lib/aarch64-linux-gnu",
            );
            info(`OPENSSL DIR set to: ${openssl_dir}`);
        }
    }
}

async function main() {
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
            `cargo build --target aarch64-unknown-linux-gnu --release --config target.aarch64-unknown-linux-gnu.linker=\\\"aarch64-linux-gnu-gcc\\\" --package ${pkg}`,
            env,
        );
        await $(
            `cargo build --target x86_64-unknown-linux-gnu --release --config target.x86_64-unknown-linux-gnu.linker=\\\"x86_64-linux-gnu-gcc\\\" --package ${pkg}`,
        );
    }
    await $("rm -rf .out");
    await $("mkdir -p .out");
    await $("mkdir -p .out/aarch64");
    await $("mkdir -p .out/x86-64");
    for (const pkg of packages) {
        await $(
            `aarch64-linux-gnu-strip target/aarch64-unknown-linux-gnu/release/${pkg} -o .out/aarch64/${pkg}`,
        );
        await $(
            `x86_64-linux-gnu-strip target/x86_64-unknown-linux-gnu/release/${pkg} -o .out/x86-64/${pkg}`,
        );
    }
}

main();

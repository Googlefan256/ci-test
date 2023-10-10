import { redBright, yellowBright } from "chalk";
import { spawn } from "node:child_process";
import { getInput } from "@actions/core";

function error(msg: string) {
    console.error(`${redBright("ERROR")}: ${msg}`);
    return process.exit(1);
}

function splitArgs() {
    return getInput("package").split(",");
}

async function $(cmd: string): Promise<undefined> {
    const ps = spawn(cmd, { shell: "sh", stdio: "inherit" });
    return new Promise((resolve) => {
        ps.on("exit", (code) => {
            if (code !== 0) {
                error(`command didn't exit successfully(${code}): ${cmd}`);
            }
            resolve(undefined);
        });
    });
}

async function main() {
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
        await $(
            `cargo build --target aarch64-unknown-linux-gnu --release --config target.aarch64-unknown-linux-gnu.linker=\\\"aarch64-linux-gnu-gcc\\\" --package ${pkg}`,
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

// Linux cloud verification only. No persistent host certificate-store writes.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.argv[2])
  throw Error(
    "Pass a private JSON file containing {origin,shareUrl}; never commit it.",
  );
const config = resolve(process.argv[2]),
  ca =
    process.env.CODEX_PROXY_CERT ||
    "/usr/local/share/ca-certificates/environment-proxy-ca.crt";
if (!existsSync(config) || !existsSync(ca))
  throw Error("Preview access file or supplied environment CA is missing");
const env = { ...process.env };
for (const name of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[name];
const args = [
  "--host",
  "unix:///var/run/docker.sock",
  "run",
  "--rm",
  "--read-only",
  "--memory",
  "2g",
  "--cpus",
  "2",
  "--pids-limit",
  "256",
  "--shm-size",
  "256m",
  "--tmpfs",
  "/tmp:rw,exec,mode=1777",
  "--tmpfs",
  "/root/.pki:rw,mode=0700",
  "--entrypoint",
  "/usr/bin/bash",
];
const mounts = [
  ["/usr", "/usr"],
  ["/lib", "/lib"],
  ["/lib64", "/lib64"],
  ["/etc/ld.so.cache", "/etc/ld.so.cache"],
  ["/etc/alternatives", "/etc/alternatives"],
  ["/etc/fonts", "/etc/fonts"],
  [process.execPath, "/run/econtent-node"],
  [resolve(root, "node_modules"), "/econtent/node_modules"],
  [ca, "/run/econtent-proxy-ca.crt"],
  [
    resolve(root, "tests/hosted/titles-preview.mjs"),
    "/econtent/titles-preview.mjs",
  ],
  [config, "/run/econtent-preview-access.json"],
];
for (const [src, dst] of mounts) {
  if (!existsSync(src))
    throw Error("Missing Linux verification dependency: " + src);
  args.push("--mount", `type=bind,src=${src},dst=${dst},readonly`);
}
args.push(
  "postgres:17-alpine",
  "-c",
  "mkdir -p /root/.pki/nssdb && certutil -N --empty-password -d sql:/root/.pki/nssdb && certutil -A -n Econtent-ephemeral-proxy-CA -t C,, -d sql:/root/.pki/nssdb -i /run/econtent-proxy-ca.crt && exec /run/econtent-node /econtent/titles-preview.mjs",
);
const result = spawnSync("docker", args, { env, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

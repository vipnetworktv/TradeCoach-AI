import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = join(root, "extension");
const outDir = join(root, "public", "downloads");
const outFile = join(outDir, "tradecoach-sync.zip");

if (!existsSync(extensionDir)) {
  console.error("Missing extension directory:", extensionDir);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.platform === "win32") {
  const source = join(extensionDir, "*");
  run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${source.replace(/'/g, "''")}' -DestinationPath '${outFile.replace(/'/g, "''")}' -Force`,
  ]);
} else {
  run("zip", ["-qr", outFile, "."], { cwd: extensionDir });
}

console.log("Created", outFile);

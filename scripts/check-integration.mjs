import { build } from "esbuild";
import { readFile, mkdtemp, rm, mkdir, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const temporary = await mkdtemp(join(tmpdir(), "carefa-integration-"));
try {
  // Materialize a complete, copyable package in a disposable directory; never deploy.
  await cp(new URL("../integration/base44/", import.meta.url), temporary, {
    recursive: true,
  });
  await mkdir(join(temporary, "base44/shared/companion"), { recursive: true });
  for (const name of [
    "reader.mjs",
    "base44-repository.mjs",
    "connection-controller.mjs",
    "connections.mjs",
  ])
    await cp(
      new URL("../companion/" + name, import.meta.url),
      join(temporary, "base44/shared/companion", name),
    );
  for (const entry of [
    "src/pages/MyAiAssistants.jsx",
    "src/pages/AiCompanionApproval.jsx",
    "base44/shared/companion/bridge-api.ts",
    "base44/functions/carefaAiCompanionApproval/entry.ts",
    "base44/functions/carefaAiCompanionConsent/entry.ts",
    "base44/functions/carefaAiCompanion/entry.ts",
    "base44/functions/carefaAiCompanionConnections/entry.ts",
  ]) {
    await build({
      entryPoints: [join(temporary, entry)],
      write: false,
      bundle: false,
      platform: "neutral",
      format: "esm",
      logLevel: "silent",
    });
  }
  console.log(
    "PASS: staged JSX and all TypeScript entrypoints compile; package materializes without deployment",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}

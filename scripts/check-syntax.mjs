// Verifica a sintaxe de todos os arquivos .js de um diretorio (node --check
// avalia apenas o arquivo informado, sem seguir imports).
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : collect(path);
    }
    return entry.name.endsWith(".js") ? [path] : [];
  });
}

const files = process.argv.slice(2).flatMap(collect);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  failed ||= result.status !== 0;
}
console.log(`Checked ${files.length} files`);
process.exit(failed ? 1 : 0);

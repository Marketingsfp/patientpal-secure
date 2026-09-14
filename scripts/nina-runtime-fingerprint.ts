/** Identidade dos fontes do atendimento Nina; usado apenas pelo build, nunca no servidor. */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const DIRETORIOS = ["src/lib/nina", "src/lib/atendimento", "src/integrations/supabase"];
const ARQUIVOS = new Set([
  "package.json",
  "bun.lock",
  "tsconfig.json",
  "vite.config.ts",
  "wrangler.jsonc",
  "src/server.ts",
  "scripts/nina-runtime-fingerprint.ts",
]);

export function fonteDoRuntimeNina(caminho: string): boolean {
  const p = caminho.replaceAll("\\", "/");
  if (ARQUIVOS.has(p)) return true;
  if (
    !/\.(?:ts|tsx|json)$/.test(p) ||
    /(?:^|\/)(?:__tests__|__fixtures__|fixtures)\/|\.(?:test|spec|fixture)\./.test(p)
  )
    return false;
  return (
    DIRETORIOS.some((dir) => p.startsWith(`${dir}/`)) ||
    /^src\/lib\/(?:nina|whatsapp)[^/]*\.(?:ts|tsx)$/.test(p) ||
    /^src\/routes\/api\/public\/(?:nina|whatsapp)[^/]*\.(?:ts|tsx)$/.test(p)
  );
}

/** Ordem de leitura, diretório absoluto e CRLF do checkout não mudam a identidade. */
export function fingerprintFontesNina(
  fontes: Array<{ caminho: string; conteudo: string }>,
): string {
  const hash = createHash("sha256");
  hash.update("nina-fontes-v1\n");
  const normalizadas = fontes
    .map(({ caminho, conteudo }) => ({
      caminho: caminho.replaceAll("\\", "/"),
      conteudo: conteudo.replace(/\r\n/g, "\n"),
    }))
    .sort((a, b) => (a.caminho < b.caminho ? -1 : a.caminho > b.caminho ? 1 : 0));
  for (const fonte of normalizadas) {
    // JSON mantém limites inequívocos entre nomes e conteúdos, inclusive com quebras de linha.
    hash.update(JSON.stringify([fonte.caminho, fonte.conteudo]));
    hash.update("\n");
  }
  return `sha256:${hash.digest("hex")}`;
}

export function calcularFingerprintNina(raiz: string): string {
  const caminhos = new Set(ARQUIVOS);
  const listar = (dir: string, recursivo: boolean) => {
    for (const item of readdirSync(join(raiz, dir), { withFileTypes: true })) {
      const p = join(dir, item.name);
      if (
        item.isDirectory() &&
        recursivo &&
        !["__tests__", "__fixtures__", "fixtures"].includes(item.name)
      )
        listar(p, true);
      if (item.isFile() && fonteDoRuntimeNina(p)) caminhos.add(p.replaceAll("\\", "/"));
    }
  };
  for (const dir of DIRETORIOS) listar(dir, true);
  listar("src/lib", false);
  listar("src/routes/api/public", false);
  return fingerprintFontesNina(
    [...caminhos].map((caminho) => ({
      caminho: relative(raiz, join(raiz, caminho)),
      conteudo: readFileSync(join(raiz, caminho), "utf8"),
    })),
  );
}

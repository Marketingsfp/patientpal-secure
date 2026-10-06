/**
 * Funções do banco (RPC) que o código da Nina chama. Depois de publicar,
 * rode `bun scripts/nina-rpcs-esperadas.ts --sql` e execute a consulta
 * (somente leitura) no banco: ela devolve as funções que ainda não existem,
 * isto é, migrations não aplicadas. Motivo: 06/10/2026 o código da troca de
 * telefone foi publicado sem a migration `nina_alterar_telefone_paciente`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const DIRETORIOS = ["src/lib/nina", "src/lib/atendimento"];
const ARQUIVOS_RAIZ = /^src\/lib\/(?:nina|whatsapp)[^/]*\.(?:ts|tsx)$/;

function listar(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(dir, e.name);
    return e.isDirectory() ? listar(caminho) : [caminho];
  });
}

function fonte(caminho: string): boolean {
  return /\.(?:ts|tsx)$/.test(caminho) &&
    !/(?:^|\/)(?:__tests__|fixtures)\/|\.(?:test|spec|fixture)\./.test(caminho);
}

/** Nomes passados literalmente a `.rpc("nome"`. */
export function rpcsDoCodigo(raiz: string): string[] {
  const arquivos = [
    ...DIRETORIOS.flatMap((d) => listar(join(raiz, d))),
    ...readdirSync(join(raiz, "src/lib")).map((n) => join(raiz, "src/lib", n)),
  ].map((c) => relative(raiz, c).replaceAll("\\", "/"))
    .filter((c) => fonte(c) && (DIRETORIOS.some((d) => c.startsWith(`${d}/`)) || ARQUIVOS_RAIZ.test(c)));
  const nomes = new Set<string>();
  for (const arquivo of new Set(arquivos)) {
    for (const m of readFileSync(join(raiz, arquivo), "utf8").matchAll(/\.rpc\(\s*["']([a-z0-9_]+)["']/g))
      nomes.add(m[1]!);
  }
  return [...nomes].sort();
}

export function consultaRpcsAusentes(nomes: readonly string[]): string {
  const valores = nomes.map((n) => `('${n}')`).join(", ");
  return `select e.nome as rpc_ausente from (values ${valores}) as e(nome) ` +
    "where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
    "where n.nspname = 'public' and p.proname = e.nome) order by 1;";
}

if (import.meta.main) {
  const nomes = rpcsDoCodigo(process.cwd());
  console.log(process.argv.includes("--sql") ? consultaRpcsAusentes(nomes) : nomes.join("\n"));
}

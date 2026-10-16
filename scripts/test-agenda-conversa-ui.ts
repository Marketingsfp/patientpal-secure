/** bun scripts/test-agenda-conversa-ui.ts
 * Painel real da agenda ao lado de um chat fictício. Sem login, banco ou agenda real.
 * Gera capturas em outputs/agenda-conversa (desktop, notebook e celular).
 */
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const saida = resolve(root, "outputs/agenda-conversa");
await mkdir(saida, { recursive: true });

const supabaseSimulado = `
const hoje = new Date();
const dia = (h, m) => { const d = new Date(hoje); d.setHours(h, m, 0, 0); return d.toISOString(); };
const medicos = [
  { id: "m1", nome: "Dra. Ana Demonstração", especialidade_id: "e1" },
  { id: "m2", nome: "Dr. Bruno Demonstração", especialidade_id: "e2" },
  { id: "m3", nome: "Dra. Carla Demonstração", especialidade_id: "e3" },
  { id: "m4", nome: "Dra. Valéria Nome Bem Comprido Demonstração", especialidade_id: "e1" },
];
const especialidades = [
  { id: "e1", nome: "Cardiologia" }, { id: "e2", nome: "Pediatria" }, { id: "e3", nome: "Ultrassonografia" },
];
const ags = [];
let n = 0;
for (const m of medicos.filter((x) => x.id !== "m4")) for (let h = 8; h < 12; h++) for (const min of [0, 30]) {
  n++;
  const livre = (n + h) % 3 === 0;
  ags.push({ id: "a" + n, medico_id: m.id, inicio: dia(h, min), fim: dia(h, min + 29),
    paciente_nome: livre ? "DISPONÍVEL" : "Paciente fictício " + n,
    procedimento: livre ? null : "Consulta", status: n % 5 === 0 ? "confirmado" : "agendado" });
}
const tabelas = { medicos, especialidades, agendamentos: ags };
function consulta(nome) {
  const q = { data: tabelas[nome] ?? [], error: null };
  const encadear = () => p;
  const p = new Proxy(q, { get: (alvo, chave) => chave === "then"
    ? (ok) => Promise.resolve(alvo).then(ok)
    : chave in alvo ? alvo[chave] : encadear });
  return p;
}
export const supabase = { from: consulta };
`;
const funcoesSimuladas = `
const estado = (window.__agendaTeste ??= { criados: [] });
export const catalogoAgendaChat = async () => ({
  procedimentos: [{ id: "p1", nome: "Consulta cardiologia" }, { id: "p2", nome: "Ultrassom de tireoide" }],
  medicos: [{ id: "m1", nome: "Dra. Ana Demonstração", ordem_chegada: false },
    { id: "m2", nome: "Dr. Bruno Demonstração", ordem_chegada: true },
    { id: "m3", nome: "Dra. Carla Demonstração", ordem_chegada: false }],
  especialidades: [],
});
export const agendamentosFuturosChat = async () => [];
export const registrarAgendamentoNaConversa = async () => ({ ok: true });
export const criarAgendamento = async ({ data }) => { estado.criados.push(data); return { ok: true, id: "novo" }; };
`;
const app = `
import React from "react";
import { createRoot } from "react-dom/client";
import { AgendaConversaPainel } from "@/components/nina/AgendaConversaPainel";
import { Toaster } from "sonner";
function Tela() {
  const [aberta, setAberta] = React.useState(true);
  const [texto, setTexto] = React.useState("");
  return (
    <div data-os-zap="true" className="h-screen bg-background p-3 text-foreground">
      <div className="oszap-columns flex h-full gap-2 overflow-hidden"
        style={{ "--oszap-chat-com-agenda": "clamp(20rem, 30%, 28rem)" }}>
        <div className={"rounded-xl border bg-card p-3 text-sm " + (aberta ? "hidden lg:block lg:flex-none lg:w-[var(--oszap-chat-com-agenda)]" : "flex-1")}>
          <p className="font-semibold">Chat (fictício)</p>
          <p className="mt-2 rounded-lg bg-muted p-2">Paciente: quero marcar cardiologia.</p>
          <textarea aria-label="Mensagem" className="mt-2 w-full rounded border p-2" value={texto} readOnly />
          {!aberta && <button className="mt-2 rounded border px-2" onClick={() => setAberta(true)}>Agendar</button>}
        </div>
        {aberta && (
          <div className="oszap-agenda flex min-w-0 flex-1 animate-in fade-in slide-in-from-right-8 duration-200">
            <AgendaConversaPainel clinicaId="11111111-1111-4111-8111-111111111111" conversaId="22222222-2222-4222-8222-222222222222"
              paciente={{ id: "33333333-3333-4333-8333-333333333333", nome: "Maria Fictícia", cpf: null, telefone: null, data_nascimento: "1990-01-01" }}
              onFechar={() => setAberta(false)} onMensagemPronta={(t) => { setTexto(t); setAberta(false); }} />
          </div>
        )}
      </div>
      <Toaster />
    </div>
  );
}
createRoot(document.getElementById("root")).render(<Tela />);
`;
// O bundler do Bun perde alguns ícones re-exportados pelo lucide (ex.: CalendarDays);
// na prévia eles viram um quadradinho. No aplicativo (Vite) os ícones reais aparecem.
const ICONES = new Set<string>();
for (const arquivo of new Bun.Glob("src/**/*.tsx").scanSync(root)) {
  const fonte = await Bun.file(resolve(root, arquivo)).text();
  for (const m of fonte.matchAll(/import\s*\{([^}]+)\}\s*from\s*"lucide-react"/g))
    for (const nome of m[1]!.split(",")) {
      const limpo = nome
        .trim()
        .split(/\s+as\s+/)[0]
        ?.replace(/^type\s+/, "");
      if (limpo && /^[A-Z]\w*$/.test(limpo)) ICONES.add(limpo);
    }
}
const iconesSimulados = `import React from "react";
const Icone = (p) => React.createElement("svg", { viewBox: "0 0 24 24", width: 16, height: 16, ...p },
  React.createElement("rect", { x: 4, y: 4, width: 16, height: 16, rx: 3, fill: "none", stroke: "currentColor", strokeWidth: 2 }));
${[...ICONES].map((n) => `export const ${n} = Icone;`).join("\n")}`;
const mocks: Record<string, string> = {
  "lucide-react": iconesSimulados,
  "@/integrations/supabase/client": supabaseSimulado,
  "@/lib/agenda/chat-agenda.functions": funcoesSimuladas,
  "@/lib/agenda/criar-agendamento.functions": funcoesSimuladas,
  "@tanstack/react-start": "export const useServerFn = fn => fn;",
  "@/hooks/use-permissoes": 'export const useAcessoModulo = () => "write";',
};
const resultado = await Bun.build({
  entrypoints: ["agenda-ui-entry"],
  target: "browser",
  format: "esm",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "isolamento-agenda",
      setup(build) {
        build.onResolve({ filter: /^agenda-ui-entry$/ }, () => ({
          path: "entry",
          namespace: "fx",
        }));
        build.onResolve({ filter: /.*/ }, (a) =>
          a.path in mocks ? { path: a.path, namespace: "fx" } : undefined,
        );
        build.onLoad({ filter: /.*/, namespace: "fx" }, (a) => ({
          contents: a.path === "entry" ? app : mocks[a.path],
          loader: "tsx",
          resolveDir: root,
        }));
      },
    },
  ],
});
if (!resultado.success) throw new Error(resultado.logs.join("\n"));
if (process.env["AGENDA_UI_BUNDLE"])
  await Bun.write(process.env["AGENDA_UI_BUNDLE"], resultado.outputs[0]);
const compilador = await compile(await Bun.file(resolve(root, "src/styles.css")).text(), {
  base: resolve(root, "src"),
  onDependency() {},
});
const css = compilador.build(
  new Scanner({
    sources: [{ base: resolve(root, "src"), pattern: "**/*.{ts,tsx}", negated: false }],
  }).scan(),
);
// `--servir <porta>`: só serve a prévia para conferência no navegador (sem teste).
const iServir = process.argv.indexOf("--servir");
const portaPrevia = iServir >= 0 ? Number(process.argv[iServir + 1] ?? 8095) : 0;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: portaPrevia,
  fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === "/app.js")
      return new Response(resultado.outputs[0], { headers: { "Content-Type": "text/javascript" } });
    if (p === "/app.css") return new Response(css, { headers: { "Content-Type": "text/css" } });
    return new Response(
      '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      { headers: { "Content-Type": "text/html" } },
    );
  },
});
if (portaPrevia) {
  console.log(`Prévia da agenda (dados fictícios): ${server.url}`);
  await new Promise(() => {});
}
try {
  const teste = Bun.spawn(
    ["node", resolve(root, "scripts/fixtures/agenda-conversa-ui.mjs"), String(server.url), saida],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await teste.exited) !== 0) throw new Error("A validação visual da agenda falhou.");
} finally {
  server.stop(true);
}

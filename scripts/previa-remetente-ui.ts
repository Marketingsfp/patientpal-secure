/** bun scripts/previa-remetente-ui.ts [--servir 8096]
 * Prévia dos balões do chat com o rótulo de quem enviou (Nina, Sistema,
 * Francisco). Mesmas classes do balão da inbox e a regra real
 * (`rotuloRemetente`). Dados fictícios; sem login nem banco.
 */
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { resolve } from "node:path";

const root = process.cwd();
const app = `
import React from "react";
import { createRoot } from "react-dom/client";
import { rotuloRemetente } from "@/lib/atendimento/remetente-mensagem";
const msgs = [
  { id: 1, direction: "in", enviada_por: "paciente", body: "Oi, quero marcar uma consulta de cardiologia." },
  { id: 2, direction: "out", enviada_por: "nina", body: "Claro! Você prefere o primeiro horário disponível ou escolher o profissional?" },
  { id: 3, direction: "out", enviada_por: "sistema", body: "Olá, Jean.\\n\\nVou encaminhar seu atendimento para a nossa equipe de Recepção e a conversa continuará por aqui.\\n\\nProtocolo do atendimento: MJ-912" },
  { id: 4, direction: "out", enviada_por: "humano", body: "*JEAN XAVIER:*\\nBom dia! Já vejo os horários para você." },
  { id: 5, direction: "out", enviada_por: "sistema", agente: "francisco", body: "Olá! Passando para saber se ficou alguma dúvida sobre o orçamento." },
  { id: 6, direction: "out", enviada_por: "sistema", body: "Seu atendimento foi encerrado. Agradecemos por entrar em contato!" },
];
function Bolha({ m }) {
  const out = m.direction === "out";
  const rotulo = rotuloRemetente(m);
  return (
    <div className={"flex items-start gap-2 " + (out ? "justify-end" : "justify-start")}>
      <div className={"oszap-bubble max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm break-words " +
        (out ? "oszap-bubble-out bg-atd-go text-atd-on-strong rounded-br-sm"
             : "bg-atd-surface border border-atd-border text-atd-ink rounded-bl-sm")}>
        <div className="whitespace-pre-wrap">{m.body}</div>
        <div className={"oszap-message-meta text-[11px] mt-2 flex flex-wrap items-center justify-between gap-2 " +
          (out ? "text-atd-on-strong/80" : "text-atd-ink-soft")}>
          <span className="min-w-0 break-words">
            16/10/2026 10:56 {rotulo && <span data-testid="remetente-mensagem">· {rotulo}</span>}
          </span>
          {out && <span className="underline underline-offset-2">Detalhes técnicos</span>}
        </div>
      </div>
    </div>
  );
}
function Tela() {
  return (
    <div data-os-zap="true" className="min-h-screen bg-atd-bg p-4 text-atd-ink">
      <p className="mb-3 text-xs text-atd-ink-soft">Prévia (dados fictícios): rótulo de quem enviou cada mensagem.</p>
      <div className="mx-auto flex max-w-3xl flex-col gap-3">{msgs.map((m) => <Bolha key={m.id} m={m} />)}</div>
    </div>
  );
}
document.documentElement.classList.toggle("dark", new URLSearchParams(location.search).get("tema") !== "claro");
createRoot(document.getElementById("root")).render(<Tela />);
`;
const resultado = await Bun.build({
  entrypoints: ["remetente-entry"],
  target: "browser",
  format: "esm",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "previa-remetente",
      setup(build) {
        build.onResolve({ filter: /^remetente-entry$/ }, () => ({
          path: "entry",
          namespace: "fx",
        }));
        build.onLoad({ filter: /.*/, namespace: "fx" }, () => ({
          contents: app,
          loader: "tsx",
          resolveDir: root,
        }));
      },
    },
  ],
});
if (!resultado.success) throw new Error(resultado.logs.join("\n"));
const compilador = await compile(await Bun.file(resolve(root, "src/styles.css")).text(), {
  base: resolve(root, "src"),
  onDependency() {},
});
const css =
  compilador.build(
    new Scanner({
      sources: [{ base: resolve(root, "src"), pattern: "**/*.{ts,tsx}", negated: false }],
    }).scan(),
  ) + (await Bun.file(resolve(root, "src/components/nina/os-zap.css")).text());
const iServir = process.argv.indexOf("--servir");
const porta = iServir >= 0 ? Number(process.argv[iServir + 1] ?? 8096) : 8096;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: porta,
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
console.log(`Prévia do remetente (dados fictícios): ${server.url}`);
await new Promise(() => {});

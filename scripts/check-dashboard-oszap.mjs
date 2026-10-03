import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
const out = path.resolve("../oszap-design-preview");
await mkdir(out, { recursive: true });
const fn = (nome, tipo) =>
  `export async function ${nome}({data}){const g=globalThis;g.__dashboardChamadas.push({tipo:${JSON.stringify(tipo)},...data});if(g.__dashboardModo==='permissao'&&${JSON.stringify(tipo)}==='resumo')throw Error('Dashboard destinado à administração e supervisão');if(g.__dashboardModo==='falha-fila'&&${JSON.stringify(tipo)}==='fila')throw Error('Fonte da fila temporariamente indisponível');const r=structuredClone(g.__dashboardFixtures[${JSON.stringify(tipo)}]);if(${JSON.stringify(tipo)}==='resumo'){const d=new Date('2026-10-03T12:00:00Z');d.setUTCDate(d.getUTCDate()-data.dias+1);r.periodo={de:d.toISOString().slice(0,10),ate:'2026-10-03'};}return r;}`;
const mocks = {
  "@tanstack/react-start": "export const useServerFn=fn=>fn;",
  "@tanstack/react-router":
    "export const useNavigate=()=>async destino=>{globalThis.__dashboardNavegacao=destino;};",
  "@/hooks/use-auth": "export const useAuth=()=>({user:{id:'gestor-demonstracao'}});",
  "@/hooks/use-clinica":
    "export const useClinica=()=>({clinicaAtual:globalThis.__dashboardModo==='sem-clinica'?null:{clinica_id:'clinica-demonstracao',clinica:{nome:'Clínica de demonstração'}}});",
  "@/hooks/use-relogio-pausa": "export const useRelogioPausa=()=>globalThis.__dashboardAgora;",
  "@/lib/atendimento/dashboard-oszap.functions":
    fn("consultarResumoDashboardOsZap", "resumo") + fn("consultarFilaHumanaDashboardOsZap", "fila"),
};
const bundle = await build({
  entryPoints: ["scripts/preview-dashboard-oszap.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "leituras-simuladas",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) =>
          a.path in mocks ? { path: a.path, namespace: "mock" } : undefined,
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
          contents: mocks[a.path],
          loader: "js",
        }));
      },
    },
  ],
});
const css = await compile(await readFile("src/styles.css", "utf8"), {
  base: path.resolve("src"),
  onDependency() {},
});
const scan = new Scanner({
  sources: [
    ...css.sources,
    { base: process.cwd(), pattern: "scripts/preview-dashboard-oszap.tsx", negated: false },
  ],
});
const styles = css.build(scan.scan()) + (await readFile("src/components/nina/os-zap.css", "utf8"));
const html = `<!doctype html><html lang="pt-BR"><head><title>Dashboard de atendimento · prévia fictícia</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`;
await writeFile(path.join(out, "dashboard.html"), html);
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  await page.route(/^https?:/, (r) =>
    r.request().url().startsWith(url) ? r.continue() : r.abort(),
  );
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(
    page.getByRole("heading", { name: "Dashboard de atendimento", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2 conversa(s) com espera crítica", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Equipe de telefonia agora" }).getByRole("row"),
  ).toHaveCount(4);
  await expect(page.getByRole("region", { name: "Resultados por pessoa" })).toContainText(
    "Supervisão · demonstração",
  );
  const texto = await page.locator(".oszap-dashboard").innerText();
  if (/Nina|confiança|homologação|prompt|modelo/i.test(texto))
    throw Error("Informações de IA no dashboard humano");
  const chamadas = await page.evaluate(() => globalThis.__dashboardChamadas);
  if (
    chamadas[0]?.tipo !== "resumo" ||
    chamadas.some((c) => c.clinicaId !== "clinica-demonstracao")
  )
    throw Error("Consultas fora do contexto autorizado");
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error("Overflow no desktop");
  await page.screenshot({ path: path.join(out, "dashboard-desktop.png"), fullPage: true });
  await page.getByLabel("Resultados por período").selectOption("30");
  await expect(page.getByRole("region", { name: "Mensagens e tempos no período" })).toContainText(
    "04/09/2026 a 03/10/2026",
  );
  await page.getByRole("button", { name: "Abrir atendimento", exact: true }).first().click();
  if ((await page.evaluate(() => globalThis.__dashboardNavegacao)).hash !== "atend-inbox")
    throw Error("Atalho incorreto");
  await page.getByRole("button", { name: "Mensagens e tempos", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Mensagens e tempos no período" }),
  ).toBeInViewport();
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    window.scrollTo(0, 0);
  });
  await page.getByRole("button", { name: "Central de conversas", exact: true }).hover();
  await expect.poll(() => page.evaluate(() => {
    const painel = document.querySelector(".oszap-dashboard");
    const link = document.querySelector("#oszap-dash-volume .oszap-dash-link");
    return { painel: getComputedStyle(painel).color, link: getComputedStyle(link).color };
  }).then((c) => c.painel === c.link ? "legível" : JSON.stringify(c))).toBe("legível");
  await page.screenshot({ path: path.join(out, "dashboard-escuro.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.fontSize = "21.6px";
    window.scrollTo(0, 0);
  });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error("Overflow no celular a 135%");
  await page.screenshot({ path: path.join(out, "dashboard-mobile.png"), fullPage: true });
  await page.goto(url + "?modo=falha-fila", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert")).toContainText("Fonte da fila");
  await expect(page.getByRole("region", { name: "Equipe de telefonia agora" })).toContainText(
    "Dados indisponíveis",
  );
  await expect(page.getByRole("region", { name: "Resultados por pessoa" })).toContainText(
    "Ana · demonstração",
  );
  await page.goto(url + "?modo=permissao", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Dashboard de atendimento indisponível" }),
  ).toBeVisible();
  if ((await page.evaluate(() => globalThis.__dashboardChamadas)).some((c) => c.tipo !== "resumo"))
    throw Error("Consulta sem autorização");
  await page.goto(url + "?modo=sem-clinica", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByText("Selecione uma clínica para abrir o dashboard.", { exact: true }),
  ).toBeVisible();
  if ((await page.evaluate(() => globalThis.__dashboardChamadas)).length)
    throw Error("Consulta sem clínica");
  if (erros.length) throw Error(erros.join("\n"));
  console.log(
    "Dashboard humano: nenhum indicador de IA, acesso/contexto, período, autoria, alertas, atalhos, falha parcial, temas e celular a 135%: OK. Serviços simulados; nenhum WhatsApp real.",
  );
} finally {
  await browser.close();
  server.close();
}

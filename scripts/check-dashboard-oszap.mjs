import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
const out = path.resolve("../oszap-design-preview");
await mkdir(out, { recursive: true });
const mocks = {
  "@tanstack/react-start": "export const useServerFn=fn=>fn;",
  "@/hooks/use-auth": "export const useAuth=()=>({user:{id:'gestor-demonstracao'}});",
  "@/hooks/use-clinica":
    "export const useClinica=()=>({clinicaAtual:globalThis.__dashboardModo==='sem-clinica'?null:{clinica_id:'clinica-demonstracao',clinica:{nome:'Clínica de demonstração'}}});",
  "@/lib/atendimento/dashboard-oszap.functions": `export async function consultarResumoDashboardOsZap({data}) {const g=globalThis;g.__dashboardChamadas.push(data);if(g.__dashboardModo==='permissao')throw Error('Dashboard destinado à administração e supervisão');if(g.__dashboardModo==='falha')throw Error('Não foi possível carregar todo o histórico');return g.__dashboardConsultar(data.periodo);}`,
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
// A prévia é uma página avulsa; o aplicativo real possui seu próprio contêiner de rolagem.
const styles =
  css.build(scan.scan()) +
  (await readFile("src/components/nina/os-zap.css", "utf8")) +
  "\nhtml,body,#root{height:auto;overflow:visible;}";
const html = `<!doctype html><html lang="pt-BR"><head><title>Relatórios de atendimento · prévia fictícia</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`;
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
  await page.clock.install({ time: new Date("2026-10-03T21:10:00Z") });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await expect(
    page.getByRole("heading", { name: "Relatórios de atendimento", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Período consultado: 03/09/2026 a 02/10/2026", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Resultados por pessoa" })).toContainText(
    "Supervisão · demonstração",
  );
  const texto = await page.locator(".oszap-dashboard").innerText();
  if (
    /Nina|confiança|homologação|prompt|modelo|online|na fila agora|Equipe de telefonia agora/i.test(
      texto,
    )
  )
    throw Error("Indicador automático ou ao vivo no relatório humano");
  if ((await page.evaluate(() => globalThis.__dashboardChamadas)).length !== 1)
    throw Error("Consulta inicial duplicada");
  await page.clock.runFor(125000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
  });
  await page.clock.runFor(1000);
  if ((await page.evaluate(() => globalThis.__dashboardChamadas)).length !== 1)
    throw Error("Atualização automática indevida");
  await page.getByLabel("Data inicial", { exact: true }).fill("2024-01-01");
  await page.getByLabel("Data final", { exact: true }).fill("2024-12-31");
  if ((await page.evaluate(() => globalThis.__dashboardChamadas)).length !== 1)
    throw Error("Rascunho disparou consulta");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(
    page.getByText("Período consultado: 01/01/2024 a 31/12/2024", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Página 1 de 8 · 366 períodos", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(page.getByText("Página 2 de 8 · 366 períodos", { exact: true })).toBeVisible();
  for (const [tipo, numeroLinhas] of [
    ["semana", 53],
    ["mes", 12],
    ["bimestre", 6],
    ["trimestre", 4],
    ["ano", 1],
  ]) {
    await page.getByLabel("Agrupar por", { exact: true }).selectOption(tipo);
    await expect(
      page.getByRole("region", { name: "Volume por período" }).locator("tbody tr"),
    ).toHaveCount(Math.min(50, numeroLinhas));
  }
  if ((await page.evaluate(() => globalThis.__dashboardChamadas)).length !== 2)
    throw Error("Agrupamento repetiu consulta");
  await page.getByLabel("Agrupar por", { exact: true }).selectOption("trimestre");
  await page.getByRole("button", { name: "Detalhar 01/01/2024 a 31/03/2024", exact: true }).click();
  await expect(
    page.getByText("Período consultado: 01/01/2024 a 31/03/2024", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Data inicial", { exact: true }).fill("2024-04-01");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("data inicial");
  if ((await page.evaluate(() => globalThis.__dashboardChamadas)).length !== 3)
    throw Error("Data inválida chegou ao servidor");
  await page.getByLabel("Período rápido", { exact: true }).selectOption("mes");
  await page.getByRole("button", { name: "Consultar", exact: true }).click();
  await expect(
    page.getByText("Período consultado: 01/09/2026 a 30/09/2026", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Agrupar por", { exact: true }).selectOption("semana");
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error("Overflow no desktop");
  await page.screenshot({ path: path.join(out, "dashboard-desktop.png"), fullPage: true });
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: path.join(out, "dashboard-escuro.png"), fullPage: true });
  await page
    .getByRole("region", { name: "Movimento ao longo do dia" })
    .screenshot({ path: path.join(out, "dashboard-horarios.png") });
  await page.getByText("Ver os números por hora", { exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Movimento ao longo do dia" }).locator("tbody tr"),
  ).toHaveCount(24);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.fontSize = "21.6px";
    window.scrollTo(0, 0);
  });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error("Overflow no celular a 135%");
  await page.screenshot({ path: path.join(out, "dashboard-mobile.png"), fullPage: true });
  await page.goto(url + "?modo=vazio", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Sem movimento registrado neste período.").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Resultados do atendimento" })).toContainText(
    "Sem medição",
  );
  await page.goto(url + "?modo=falha", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert")).toContainText("Nenhum total foi calculado");
  await expect(page.getByText("Volume total", { exact: true })).toHaveCount(0);
  await page.goto(url + "?modo=permissao", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert")).toContainText("administração e supervisão");
  await expect(page.getByRole("region", { name: "Resultados por pessoa" })).toHaveCount(0);
  await page.goto(url + "?modo=sem-clinica", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByText("Selecione uma clínica para abrir o dashboard.", { exact: true }),
  ).toBeVisible();
  if ((await page.evaluate(() => globalThis.__dashboardChamadas)).length)
    throw Error("Consulta sem clínica");
  if (erros.length) throw Error(erros.join("\n"));
  console.log(
    "Relatórios humanos: datas, 6 agrupamentos, ano bissexto, paginação, detalhe, ausência de polling, recebidas/enviadas, vazio, falhas, acesso, temas e celular a 135%: OK. Serviços simulados; nenhum WhatsApp real.",
  );
} finally {
  await browser.close();
  server.close();
}

import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";
const url = process.argv[2];
const saida = process.argv[3];
const browser = await chromium.launch({ headless: true, channel: "chrome", timeout: 15000 });
try {
  console.log("Chrome de teste iniciado.");
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  const pedidoMamografia = "Altere o dinheiro da mamografia para 180 e preserve o cartão.";
  // Botão único: o mesmo caminho cria, edita um ou edita vários cadastros.
  const abrir = async (texto, tipo = "") => {
    await page.goto(`${url}${tipo}`);
    await page.getByRole("button", { name: "Preencher com IA", exact: true }).click();
    await page.getByLabel("Informações", { exact: true }).fill(texto);
  };
  const preparar = () =>
    page.getByRole("button", { name: /^Preparar (para revisão|de novo)$/ }).click();
  const confirmar = (n) =>
    page.getByRole("button", { name: `Confirmar e publicar ${n} selecionado(s)`, exact: true });
  const saves = () => page.evaluate(() => window.__catalogoTeste.saves);

  await abrir(pedidoMamografia);
  await preparar();
  await expect(page.getByText("Edição · Mamografia · Exame/procedimento")).toBeVisible();
  await expect(page.getByText(/180,00/).first()).toBeVisible();
  await expect(page.getByText(/Faltou preencher \(\d+\)/)).toBeVisible();
  expect(await saves()).toHaveLength(0);
  await page.screenshot({ path: resolve(saida, "previa-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(saida, "previa-mobile.png") });
  expect(
    await page.locator('[role="dialog"]').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBe(true);
  await page.getByRole("button", { name: "Fechar", exact: true }).first().click();
  expect(await saves()).toHaveLength(0);
  console.log("PASS prévia desktop/mobile, aviso de lacunas e fechar sem escrita");

  await page.setViewportSize({ width: 1280, height: 900 });
  await abrir(pedidoMamografia);
  await preparar();
  await confirmar(1).click();
  await expect(page.getByRole("checkbox", { name: /Mamografia.*Publicado/ })).toBeDisabled();
  const confirmado = (await saves())[0];
  expect(confirmado.id).toBe("22222222-2222-4222-8222-222222222222");
  expect(confirmado.esperadoUpdatedAt).toBeTruthy();
  expect(confirmado.dados.formas_pagamento.map((p) => p.valor)).toEqual([180, 200]);
  console.log("PASS confirmação preserva cartão e atualiza mesmo ID");

  await abrir("Altere a quinta-feira da Dra. Ana para 14:30.", "?profissional=1");
  await preparar();
  await expect(page.getByText(/14:30/).last()).toBeVisible();
  await confirmar(1).click();
  await expect(page.getByRole("checkbox", { name: /Dra. Ana.*Publicado/ })).toBeDisabled();
  expect((await saves())[0].dados.horarios[0].recorrencia).toBe("Quinzenal");
  console.log("PASS consulta usa a mesma revisão e preserva recorrência");

  await abrir(pedidoMamografia);
  await preparar();
  await page.evaluate(() => {
    window.__catalogoTeste.falhar = true;
  });
  await confirmar(1).click();
  await expect(page.getByRole("alert")).toContainText("Prepare de novo");
  expect(await saves()).toHaveLength(0);
  await expect(page.getByLabel("Informações", { exact: true })).toHaveValue(pedidoMamografia);
  await page.evaluate(() => {
    window.__catalogoTeste.falhar = false;
  });
  console.log("PASS conflito mantém o texto para preparar de novo");

  await abrir(pedidoMamografia);
  await page.evaluate(() => {
    window.__catalogoTeste.esperar = true;
  });
  await preparar();
  await expect.poll(() => page.evaluate(() => !!window.__catalogoTeste.resolver)).toBe(true);
  await page.getByRole("button", { name: "Fechar", exact: true }).first().click();
  await page.evaluate(async () => {
    window.__catalogoTeste.esperar = false;
    window.__catalogoTeste.resolver();
    await new Promise((r) => setTimeout(r, 50));
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await saves()).toHaveLength(0);
  console.log("PASS fechar descarta resposta atrasada");

  await abrir("Cadastre um exame novo: R$ 100 no dinheiro.");
  await preparar();
  await expect(page.getByText("Novo · Exame criado por IA · Exame/procedimento")).toBeVisible();
  await expect(page.getByText(/Faltou preencher \(\d+\)/)).toBeVisible();
  await expect(page.getByText("Pedido médico (exige ou dispensa)")).toBeVisible();
  await page.screenshot({ path: resolve(saida, "novo-lacunas.png"), fullPage: true });
  expect(await saves()).toHaveLength(0);
  await confirmar(1).click();
  await expect(
    page.getByRole("checkbox", { name: /Exame criado por IA.*Publicado/ }),
  ).toBeDisabled();
  const criado = (await saves())[0];
  expect(criado.id).toBeNull();
  expect(criado.publicar).toBe(true);
  expect(criado.dados.nome).toBe("Exame criado por IA");
  console.log("PASS criação pelo mesmo botão, com aviso do que faltou e publicação mesmo assim");

  await abrir("Cadastre um exame novo: R$ 100 no dinheiro.");
  await preparar();
  await page.getByRole("button", { name: "Ajustar no formulário completo", exact: true }).click();
  await expect(page.getByPlaceholder("Ex.: Ultrassonografia de tireoide")).toHaveValue(
    "Exame criado por IA",
  );
  await expect(page.getByText("Faltou preencher: Quem realiza")).toBeVisible();
  expect(await saves()).toHaveLength(0);
  console.log("PASS cadastro novo pode seguir para o formulário completo antes de salvar");

  await abrir(
    "Altere o dinheiro da mamografia para 180, a quinta-feira da Dra. Ana para 14:30 e cadastre um exame novo.",
  );
  await preparar();
  await expect(confirmar(3)).toBeEnabled();
  expect(await saves()).toHaveLength(0);
  await page.getByRole("checkbox", { name: /Dra. Ana/ }).uncheck();
  await confirmar(2).click();
  await expect(page.getByRole("checkbox", { name: /Mamografia.*Publicado/ })).toBeDisabled();
  expect((await saves()).map((i) => i.dados.nome)).toEqual(["Mamografia", "Exame criado por IA"]);
  await expect(confirmar(0)).toBeDisabled();
  console.log("PASS vários itens (criar e editar), seleção parcial e proteção contra republicação");

  await page.getByLabel("Informações", { exact: true }).fill("Pedido ambiguo: mudar cardiologia.");
  await preparar();
  await expect(page.getByRole("alert")).toContainText("qual médico");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  console.log("PASS ambiguidade exige esclarecimento antes da revisão");

  await page.goto(`${url}?leitura=1`);
  await expect(page.getByText("Mamografia", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preencher com IA", exact: true })).toHaveCount(0);
  for (const antigo of ["Criar ou editar com IA", "Editar vários com IA"])
    await expect(page.getByRole("button", { name: antigo, exact: true })).toHaveCount(0);
  expect(erros).toEqual([]);
  console.log("PASS perfil somente leitura; botões antigos removidos; sem erros de renderização");
} finally {
  await browser.close();
}

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
  const abrir = async (tipo = "") => {
    await page.goto(`${url}${tipo}`);
    await page.getByRole("button", { name: "Criar ou editar com IA", exact: true }).click();
    await page.getByRole("button", { name: "Editar cadastro existente", exact: true }).click();
    await page.getByRole("combobox").click();
    await page
      .getByPlaceholder(/Buscar exame|Buscar profissional/)
      .fill(tipo ? "cardiologia" : "mamografia");
    await page.getByRole("option").click();
    await page
      .getByLabel("O que deseja mudar?")
      .fill(
        tipo
          ? "Altere o início da quinta-feira para 14:30."
          : "Altere o dinheiro para 180 e preserve o cartão.",
      );
  };
  const gerar = () =>
    page.getByRole("button", { name: "Gerar prévia da edição", exact: true }).click();
  const saves = () => page.evaluate(() => window.__catalogoTeste.saves);
  await abrir();
  await gerar();
  await expect(page.getByRole("heading", { name: /Prévia da edição/ })).toBeVisible();
  await expect(page.getByText(/180,00/).first()).toBeVisible();
  expect(await saves()).toHaveLength(0);
  await page.screenshot({ path: resolve(saida, "previa-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(saida, "previa-mobile.png") });
  expect(
    await page.locator('[role="dialog"]').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBe(true);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(await saves()).toHaveLength(0);
  console.log("PASS prévia desktop/mobile e cancelamento sem escrita");

  await page.setViewportSize({ width: 1280, height: 900 });
  await abrir();
  await gerar();
  await page.getByRole("button", { name: "Confirmar e publicar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const confirmado = (await saves())[0];
  expect(confirmado.id).toBe("22222222-2222-4222-8222-222222222222");
  expect(confirmado.publicar).toBe(true);
  expect(confirmado.esperadoUpdatedAt).toBeTruthy();
  expect(confirmado.dados.formas_pagamento.map((p) => p.valor)).toEqual([180, 200]);
  console.log("PASS confirmação preserva cartão e atualiza mesmo ID");

  await abrir("?profissional=1");
  await gerar();
  await expect(page.getByText(/14:30/).last()).toBeVisible();
  await page.getByRole("button", { name: "Confirmar e publicar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await saves())[0].dados.horarios[0].recorrencia).toBe("Quinzenal");
  console.log("PASS consulta usa mesma prévia e preserva recorrência");

  await abrir();
  await gerar();
  await page.evaluate(() => {
    window.__catalogoTeste.falhar = true;
  });
  await page.getByRole("button", { name: "Confirmar e publicar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("nova prévia");
  expect(await saves()).toHaveLength(0);
  await page.getByRole("button", { name: "Ajustar pedido", exact: true }).click();
  await expect(page.getByLabel("O que deseja mudar?")).toHaveValue(
    "Altere o dinheiro para 180 e preserve o cartão.",
  );
  console.log("PASS conflito mantém pedido para gerar nova prévia");

  await abrir();
  await page.evaluate(() => {
    window.__catalogoTeste.esperar = true;
  });
  await gerar();
  await expect.poll(() => page.evaluate(() => !!window.__catalogoTeste.resolver)).toBe(true);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.evaluate(async () => {
    window.__catalogoTeste.resolver();
    await new Promise((r) => setTimeout(r, 50));
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await saves()).toHaveLength(0);
  console.log("PASS cancelar descarta resposta atrasada");

  await page.goto(String(url));
  await page.getByRole("button", { name: "Criar ou editar com IA", exact: true }).click();
  await page
    .getByLabel("Informações para o novo cadastro")
    .fill("Exame novo custa R$ 100 no dinheiro.");
  await page
    .getByRole("button", { name: "Organizar e preencher campos com IA", exact: true })
    .click();
  await expect(page.locator('input[value="Exame criado por IA"]')).toBeVisible();
  expect(await saves()).toHaveLength(0);
  console.log("PASS criação existente continua exigindo revisão");

  await page.goto(String(url));
  await page.getByRole("button", { name: "Editar vários com IA", exact: true }).click();
  await page.getByLabel("O que deseja alterar?").fill("Altere o dinheiro da mamografia para 180 e a quinta-feira da Dra. Ana para 14:30.");
  await page.getByRole("button", { name: "Preparar alterações", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirmar e publicar 2 selecionado(s)", exact: true })).toBeEnabled();
  expect(await saves()).toHaveLength(0);
  await page.getByRole("checkbox", { name: /Dra. Ana/ }).uncheck();
  await page.getByRole("button", { name: "Confirmar e publicar 1 selecionado(s)", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Mamografia.*Publicado/ })).toBeDisabled();
  expect((await saves()).map(i => i.tipo)).toEqual(["servico"]);
  await expect(page.getByRole("button", { name: "Confirmar e publicar 0 selecionado(s)", exact: true })).toBeDisabled();
  console.log("PASS lote misto, seleção parcial e proteção contra republicação");

  await page.getByLabel("O que deseja alterar?").fill("Pedido ambiguo: mudar cardiologia para 130 reais.");
  await page.getByRole("button", { name: "Preparar alterações", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("qual médico");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  console.log("PASS ambiguidade exige esclarecimento antes da prévia");

  await page.goto(`${url}?leitura=1`);
  await expect(page.getByText("Mamografia", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar ou editar com IA", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar vários com IA", exact: true })).toHaveCount(0);
  expect(erros).toEqual([]);
  console.log("PASS perfil somente leitura; sem erros de renderização");
} finally {
  await browser.close();
}

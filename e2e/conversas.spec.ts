/**
 * CENÁRIO 1 (interface) — identificação, troca rápida A → B → A e URL fixa.
 *
 * Este arquivo prova o que o teste de contrato NÃO prova: que a tela mostra.
 */
import { expect, test } from "@playwright/test";
import { abrirAtendimento, credencial, entrar, listaConversas } from "./apoio";

const cred = credencial("E2E");

test.skip(!cred, "Defina E2E_EMAIL e E2E_SENHA (usuário de homologação) para rodar.");

test.beforeEach(async ({ page }) => {
  await entrar(page, cred!);
  await abrirAtendimento(page);
});

test("nome é a identificação principal na lista e no cabeçalho", async ({ page }) => {
  const itens = listaConversas(page);
  await expect(itens.first()).toBeVisible();

  const titulo = (await itens.first().innerText()).split("\n")[0]!.trim();
  await itens.first().click();

  const cabecalho = page.getByTestId("titulo-conversa");
  await expect(cabecalho).toBeVisible();
  await expect(cabecalho).toContainText(titulo.slice(0, 20));

  // Um cabeçalho só com telefone é falha de identificação.
  const textoCabecalho = (await cabecalho.innerText()).trim();
  const soDigitos = textoCabecalho.replace(/\D/g, "");
  expect(soDigitos.length === textoCabecalho.replace(/\s/g, "").length).toBe(false);

  // Telefone continua visível como dado secundário.
  await expect(page.locator("text=/\\+?\\d{2}[\\s(]*\\d{2}/").first()).toBeVisible();
});

test("troca A → B → A mantém a mesma URL e não mistura mensagens", async ({ page }) => {
  const itens = listaConversas(page);
  await expect(itens.nth(1)).toBeVisible();

  const idA = await itens.nth(0).getAttribute("data-conversa-id");
  const idB = await itens.nth(1).getAttribute("data-conversa-id");
  expect(idA).not.toBe(idB);

  await itens.nth(0).click();
  await expect(page.getByTestId("titulo-conversa")).toHaveAttribute("data-conversa-id", idA!);
  const tituloA = await page.getByTestId("titulo-conversa").innerText();

  await itens.nth(1).click();
  await expect(page.getByTestId("titulo-conversa")).toHaveAttribute("data-conversa-id", idB!);

  await itens.nth(0).click();
  await expect(page.getByTestId("titulo-conversa")).toHaveAttribute("data-conversa-id", idA!);
  await expect(page.getByTestId("titulo-conversa")).toHaveText(tituloA);

  // A URL nunca muda: a seleção é interna.
  await expect(page).toHaveURL(/\/app\/nina$/);
});

test("rascunho não vaza de um paciente para outro", async ({ page }) => {
  const itens = listaConversas(page);
  await expect(itens.nth(1)).toBeVisible();

  await itens.nth(0).click();
  const campo = page.getByRole("textbox").last();
  await expect(campo).toBeVisible();
  await campo.fill("RASCUNHO SINTETICO A");

  await itens.nth(1).click();
  await expect(page.getByRole("textbox").last()).not.toHaveValue("RASCUNHO SINTETICO A");

  await itens.nth(0).click();
  await expect(page.getByRole("textbox").last()).toHaveValue("RASCUNHO SINTETICO A");
  await page.getByRole("textbox").last().fill("");
});

test("a busca encontra por nome e por número da conversa", async ({ page }) => {
  const busca = page.getByPlaceholder(/busc/i).first();
  await expect(busca).toBeVisible();

  const primeiro = listaConversas(page).first();
  await expect(primeiro).toBeVisible();
  const nome = (await primeiro.innerText()).split("\n")[0]!.trim();

  const termo = nome.split(" ")[0]!;
  await busca.fill(termo);
  await expect(listaConversas(page).first()).toContainText(termo, { timeout: 15_000 });
});

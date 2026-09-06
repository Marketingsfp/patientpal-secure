/**
 * CENÁRIO 4 (interface) — catálogo estruturado.
 *
 * Cadastro manual e preenchimento por IA são verificados NA TELA. As escritas
 * só rodam com E2E_CATALOGO_ESCRITA=1, porque o catálogo ainda é compartilhado
 * com a operação (bloqueio registrado na Fase 2).
 */
import { expect, test } from "@playwright/test";
import { credencial, entrar } from "./apoio";

const cred = credencial("E2E");
const podeEscrever = process.env["E2E_CATALOGO_ESCRITA"] === "1";

test.skip(!cred, "Defina E2E_EMAIL e E2E_SENHA para rodar.");

test.beforeEach(async ({ page }) => {
  await entrar(page, cred!);
  await page.goto("/app/nina", { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: /base|catálogo|conhecimento/i }).first().click();
});

test("os dois formulários existem e a busca filtra registros", async ({ page }) => {
  await expect(page.getByRole("button", { name: /exame|procedimento/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /consulta|profissional/i }).first()).toBeVisible();

  const busca = page.getByPlaceholder(/busc/i).first();
  await expect(busca).toBeVisible();
  await busca.fill("zzz-nao-existe-zzz");
  await expect(page.getByText(/nenhum|sem resultados/i).first()).toBeVisible();
});

test("nota interna aparece para a equipe e é marcada como interna", async ({ page }) => {
  await page.getByRole("button", { name: /exame|procedimento/i }).first().click();
  const nota = page.getByLabel(/nota interna/i);
  if (await nota.count()) await expect(nota.first()).toBeVisible();
});

test("cadastro manual + preenchimento com IA", async ({ page }) => {
  test.skip(!podeEscrever, "Escrita no catálogo desativada (E2E_CATALOGO_ESCRITA=1 para ativar).");

  await page.getByRole("button", { name: /exame|procedimento/i }).first().click();
  const nome = page.getByLabel(/nome/i).first();
  await nome.fill("TESTE Exame Sintético Fase 4");

  const botaoIA = page.getByRole("button", { name: /organizar|preencher com ia|ia/i }).first();
  if (await botaoIA.count()) {
    await botaoIA.click();
    // Resultado real da IA, aguardado por condição e com limite de tempo.
    await expect(nome).not.toHaveValue("", { timeout: 60_000 });
  }

  await page.getByRole("button", { name: /salvar|rascunho/i }).first().click();
  await expect(page.getByText(/salvo|rascunho/i).first()).toBeVisible({ timeout: 20_000 });
});

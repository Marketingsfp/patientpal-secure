/**
 * Apoio dos testes de interface: login real pela tela, sem atalho que ignore
 * autenticação, permissão ou validação.
 */
import { expect, type Page } from "@playwright/test";

export type Credencial = { email: string; senha: string };

export function credencial(prefixo: "E2E" | "E2E_ADMIN"): Credencial | null {
  const email = process.env[`${prefixo}_EMAIL`];
  const senha = process.env[prefixo === "E2E" ? "E2E_SENHA" : "E2E_ADMIN_SENHA"];
  return email && senha ? { email, senha } : null;
}

/** Entra pela tela de login do próprio sistema. */
export async function entrar(page: Page, cred: Credencial) {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).first().fill(cred.email);
  await page.getByLabel(/senha/i).first().fill(cred.senha);
  await page.getByRole("button", { name: /entrar|acessar|login/i }).first().click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 30_000 });
}

/** Abre a tela de atendimento — sempre a MESMA URL, sem endereço por conversa. */
export async function abrirAtendimento(page: Page) {
  await page.goto("/app/nina", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/app\/nina$/);
}

/** Itens da lista de conversas, aguardando a carga real (sem pausa fixa). */
export function listaConversas(page: Page) {
  return page.getByTestId("item-conversa");
}

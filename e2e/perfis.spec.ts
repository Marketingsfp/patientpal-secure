/**
 * CENÁRIO 2 e 3 (interface) — perfis, presença e transferência.
 *
 * Sessões separadas de verdade: cada perfil entra com o próprio usuário.
 * Nenhum teste altera estado do frontend para "virar" administrador.
 */
import { expect, test } from "@playwright/test";
import { abrirAtendimento, credencial, entrar, listaConversas } from "./apoio";

const admin = credencial("E2E_ADMIN");
const atendente = credencial("E2E");

test.describe("administrador — supervisão", () => {
  test.skip(!admin, "Defina E2E_ADMIN_EMAIL e E2E_ADMIN_SENHA para rodar.");

  test("vê a operação e pode transferir, mas não pode assumir nem responder", async ({ page }) => {
    await entrar(page, admin!);
    await abrirAtendimento(page);

    const itens = listaConversas(page);
    await expect(itens.first()).toBeVisible();
    await itens.first().click();
    await expect(page.getByTestId("titulo-conversa")).toBeVisible();

    // Transferir continua disponível.
    await expect(page.getByRole("button", { name: /transferir/i }).first()).toBeVisible();

    // Assumir não é oferecido ao administrador.
    await expect(page.getByRole("button", { name: /^assumir/i })).toHaveCount(0);

    // Se houver campo de resposta, ele não aceita envio pelo administrador.
    const enviar = page.getByRole("button", { name: /enviar/i });
    if (await enviar.count()) await expect(enviar.first()).toBeDisabled();
  });

  test("a lista de destinos da transferência mostra presença e exclui administradores", async ({ page }) => {
    await entrar(page, admin!);
    await abrirAtendimento(page);
    await listaConversas(page).first().click();

    await page.getByRole("button", { name: /transferir/i }).first().click();
    const painel = page.getByRole("dialog");
    await expect(painel).toBeVisible();

    // Estado textual, nunca só cor.
    await expect(painel.getByText(/Online|Em pausa|Offline/).first()).toBeVisible();

    // O próprio administrador não aparece como destino possível.
    await expect(painel.getByText(admin!.email, { exact: false })).toHaveCount(0);
  });
});

test.describe("atendente — restrições", () => {
  test.skip(!atendente, "Defina E2E_EMAIL e E2E_SENHA para rodar.");

  test("o escopo padrão mostra apenas as conversas do próprio atendente", async ({ page }) => {
    await entrar(page, atendente!);
    await abrirAtendimento(page);
    const escopo = page.getByLabel("Escopo das conversas");
    await expect(escopo).toBeVisible();
    await expect(escopo).toContainText(/minhas/i);
  });
});

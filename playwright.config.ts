/**
 * FASE 4 — testes de INTERFACE (somente ferramenta de desenvolvimento).
 *
 * Não substitui o conjunto atual: `bun test` continua sendo a suíte de
 * unidade/contrato e não enxerga estes arquivos (aqui usamos `.spec.ts`).
 *
 * Execução: `bunx playwright test`
 * Credenciais de homologação (obrigatórias, senão os testes são pulados):
 *   E2E_URL      (padrão http://localhost:8080)
 *   E2E_EMAIL / E2E_SENHA
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_SENHA   (cenário de perfil administrador)
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  // Sem espera fixa arbitrária: tudo por condição real com limite de tempo.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "evidencias/interface/resultado.json" }]],
  outputDir: "evidencias/interface/artefatos",
  use: {
    baseURL: process.env["E2E_URL"] ?? "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

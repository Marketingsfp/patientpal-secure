import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";
const url = process.argv[2];
const saida = process.argv[3];
const browser = await chromium.launch({ headless: true, channel: "chrome", timeout: 15000 });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") erros.push(m.text());
  });
  await page.goto(url);
  await page.waitForTimeout(1500);
  if (erros.length) console.log("ERROS DA PÁGINA:", erros.join(" | ").slice(0, 1500));
  await expect(page.getByRole("region", { name: "Agenda" })).toBeVisible();
  await expect(page.getByText("Dra. Ana Demonstração").first()).toBeVisible();
  await page.screenshot({ path: resolve(saida, "desktop-1600.png") });
  console.log("PASS agenda ao lado do chat (1600px)");

  // Busca por parte do nome acha quem não tem horários no dia; poucas colunas esticam.
  await page.getByLabel("Buscar profissional ou especialidade").fill("val");
  await expect(page.getByText("Dra. Valéria Nome Bem Comprido Demonstração")).toBeVisible();
  await expect(page.getByText("Sem horários neste dia")).toBeVisible();
  const largura = await page
    .locator("section", { hasText: "Sem horários neste dia" })
    .last()
    .evaluate((e) => e.getBoundingClientRect().width);
  if (largura < 600) throw new Error("Coluna única não esticou: " + largura);
  await page.screenshot({ path: resolve(saida, "busca-val.png") });
  await page.getByLabel("Buscar profissional ou especialidade").fill("dra");
  await page.screenshot({ path: resolve(saida, "busca-dra.png") });
  await page.getByLabel("Buscar profissional ou especialidade").fill("");
  console.log("PASS busca por parte do nome e colunas responsivas");

  // Ordem de chegada: só orienta, sem confirmar.
  const colunaBruno = page.locator("section", { hasText: "Dr. Bruno Demonstração" }).last();
  await colunaBruno
    .getByRole("button", { name: /Agendar/ })
    .first()
    .click();
  await expect(page.getByText(/ordem de chegada: não há horário marcado/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar agendamento" })).toHaveCount(0);
  console.log("PASS ordem de chegada não oferece horário");

  // Vaga normal: escolhe procedimento e confirma.
  const colunaAna = page.locator("section", { hasText: "Dra. Ana Demonstração" }).last();
  await colunaAna
    .getByRole("button", { name: /Agendar/ })
    .first()
    .click();
  await page.getByLabel("Procedimento").fill("cardio");
  await page.getByRole("button", { name: "Consulta cardiologia" }).click();
  await page.screenshot({ path: resolve(saida, "confirmar.png") });
  await page.getByRole("button", { name: "Confirmar agendamento" }).click();
  await expect(page.getByText("Agendamento realizado")).toBeVisible();
  const criados = await page.evaluate(() => window.__agendaTeste.criados);
  expect(criados).toHaveLength(1);
  expect(criados[0].payload.paciente_id).toBe("33333333-3333-4333-8333-333333333333");
  expect(criados[0].payload.medico_id).toBe("m1");
  await page.getByRole("button", { name: "Levar confirmação para a mensagem" }).click();
  await expect(page.getByRole("region", { name: "Agenda" })).toHaveCount(0);
  await expect(page.getByLabel("Mensagem")).toHaveValue(/Seu agendamento foi realizado/);
  console.log("PASS agenda e confirmação vai para a mensagem");

  await page.getByRole("button", { name: "Agendar" }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: resolve(saida, "notebook-1280.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(saida, "celular-390.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  console.log("PASS notebook e celular sem rolagem lateral");
  expect(erros).toEqual([]);
} finally {
  await browser.close();
}

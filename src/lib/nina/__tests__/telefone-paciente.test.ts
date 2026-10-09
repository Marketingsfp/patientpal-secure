import { expect, test } from "bun:test";
import { pedidoAlteracaoTelefone, registrarPedidoTelefone } from "../telefone-paciente";
import { estadoVazio, normalizarEstado } from "../fluxo-estado-normalizar";

test.each([
  "troque o telefone para (21) 98888-7777",
  "meu telefone correto é +55 21 98888-7777",
  "pode usar o celular 21988887777",
  "confirmo, mas altere o telefone para 21988887777",
])("pedido explícito: %s", (texto) => {
  expect(pedidoAlteracaoTelefone(texto)).toEqual({ telefone: "21988887777" });
});
test.each([
  "confirmo",
  "fechado, pode marcar",
  "o telefone está correto, confirmo",
  "telefone certo, pode marcar",
  "meu telefone é esse mesmo, confirmo",
  "não quero alterar o telefone",
  "não altere o telefone para 21988887777",
  "não troque meu telefone",
  "qual o telefone da clínica?",
  "21988887777",
  "meu CPF é 21988887777",
])("não autoriza correção: %s", (texto) => {
  expect(pedidoAlteracaoTelefone(texto)).toBeNull();
});

test("paciente pode desistir da correção pendente", () => {
  const e = estadoVazio();
  registrarPedidoTelefone(e, "quero mudar o telefone");
  expect(registrarPedidoTelefone(e, "não precisa trocar o telefone")).toBe(true);
  expect(e.patient.alteracao_telefone).toBeNull();
});
test.each([
  "troque o telefone",
  "troque para o telefone 988887777",
  "mude o telefone para 123456789012345",
  "troque o telefone 21988887777 ou 21977776666",
])("pede só o dado válido faltante: %s", (texto) => {
  expect(pedidoAlteracaoTelefone(texto)).toEqual({ telefone: null });
});
test("resposta à coleta aceita telefone sem repetir pedido; estado sobrevive à normalização", () => {
  const e = estadoVazio();
  e.whatsapp_remetente = "21999990000";
  expect(registrarPedidoTelefone(e, "quero mudar o telefone")).toBe(true);
  expect(registrarPedidoTelefone(e, "(21) 98888-7777")).toBe(true);
  expect(normalizarEstado(e).patient.alteracao_telefone?.telefone).toBe("21988887777");
  expect(e.whatsapp_remetente).toBe("21999990000");
});

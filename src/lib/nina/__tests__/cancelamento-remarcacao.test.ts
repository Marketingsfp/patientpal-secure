import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { alteracaoExplicita, alteracaoPeloJev, motivoAlteracao, REGRA_CANCELAMENTO_REMARCACAO } from "../cancelamento-remarcacao";
import { motivoParaAtendimento } from "../../atendimento/texto-interno-apresentacao";
import { categoriaDoMotivo } from "../jev-motivo";

test.each([
  ["quero cancelar minha consulta", false, "cancelamento"],
  ["pode ser 8h. ai cancela o de amanha ne", true, "cancelamento"],
  ["quero desmarcar meu exame", false, "cancelamento"],
  ["preciso remarcar", false, "remarcacao"],
  ["não vou conseguir ir, pode remarcar?", true, "remarcacao"],
  ["não quero cancelar, mas quero remarcar", true, "remarcacao"],
  ["ih moça esqueci q amanha ela tem fisio, da pra muda pra sabado de manha?", true, "remarcacao"],
  ["muda para sábado de manhã", false, null],
  ["não quero cancelar minha consulta", true, null],
  ["não remarca", true, null],
  ["se eu precisar remarcar tem taxa?", true, null],
  ["como funciona o cancelamento?", true, null],
  ["quero cancelar o pix", true, null],
  ["pode confirmar o horário", true, null],
] as const)("pedido explícito: %s", (mensagem, reserva, esperado) => {
  expect(alteracaoExplicita(mensagem, reserva)).toBe(esperado);
});

test("decisão semântica exige confiança e motivos têm categoria e explicação", () => {
  for (const tipo of ["cancelamento", "remarcacao"] as const) {
    expect(alteracaoPeloJev({ choice: tipo, confidence: 0.95 })).toBe(tipo);
    expect(alteracaoPeloJev({ choice: tipo, confidence: 0.3 })).toBeNull();
    expect(categoriaDoMotivo(motivoAlteracao(tipo))).toBe("cancelamento_remarcacao");
    expect(motivoParaAtendimento(motivoAlteracao(tipo))).toContain("equipe humana");
  }
  expect(alteracaoPeloJev(undefined)).toBeNull();
  expect(alteracaoPeloJev({ choice: "nenhum", confidence: 1 })).toBeNull();
});

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
function simular(ambiente: string, caso: string, mensagem: string) {
  const p = Bun.spawnSync([process.execPath, fixture, ambiente, `alteracao_${caso}`, mensagem], {
    cwd: fileURLToPath(new URL("../../../../../", import.meta.url)), stdout: "pipe", stderr: "pipe", timeout: 15_000,
  });
  expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
  const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="));
  expect(linha).toBeDefined();
  return JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
}

for (const ambiente of ["producao", "homologacao"]) {
  test.each([
    ["nova_fallback", "quero cancelar minha consulta", "CANCELAMENTO_SOLICITADO"],
    ["retomada_fallback", "ih moça esqueci q amanha ela tem fisio, da pra muda pra sabado de manha?", "REMARCACAO_SOLICITADA"],
    ["retomada", "pode ser 8h. ai cancela o de amanha ne", "CANCELAMENTO_SOLICITADO"],
    ["semantica", "aquela reserva vai ter que ficar pra semana que vem", "REMARCACAO_SOLICITADA"],
  ])(`${ambiente}: %s encaminha antes de catálogo e agenda`, (caso, mensagem, motivo) => {
    const r = simular(ambiente, caso, mensagem);
    expect(r.encaminhamentos).toHaveLength(1);
    expect(r.encaminhamentos[0].motivo).toContain(motivo);
    expect(r.encaminhamentos[0].setor).toBe("Agendamento");
    expect(r.ferramentas).toEqual(["solicitar_atendente_humano"]);
    expect(r.requests).toHaveLength(0);
    expect(r.rede).toBe(0);
    if (ambiente === "homologacao") expect(r.resposta).toContain("simulação");
  });
  test(`${ambiente}: opção ainda não reservada segue; contrato acompanha o modelo`, () => {
    const r = simular(ambiente, "nova_fallback", "pode mudar para sábado de manhã?");
    expect(r.encaminhamentos).toHaveLength(0);
    expect(r.requests).toHaveLength(1);
    expect(JSON.stringify(r.requests[0].messages)).toContain(REGRA_CANCELAMENTO_REMARCACAO);
  });
  test(`${ambiente}: fallback conversacional encaminha e não executa reserva posterior`, () => {
    const r = simular(ambiente, "fallback_modelo", "aquela reserva vai ter que ficar pra semana que vem");
    expect(r.encaminhamentos).toHaveLength(1);
    expect(r.ferramentas).not.toContain("agendar");
  });
  test(`${ambiente}: revisão superada não encaminha`, () => {
    const r = simular(ambiente, "obsoleto", "quero cancelar minha consulta");
    expect(r.encaminhamentos).toHaveLength(0);
    expect(r.resposta).toBe("");
  });
  test(`${ambiente}: urgência preservada junto do motivo administrativo`, () => {
    const r = simular(ambiente, "urgencia", "quero cancelar minha consulta, estou com falta de ar");
    expect(r.encaminhamentos).toHaveLength(1);
    expect(r.encaminhamentos[0].urgencia).toBe("alta");
    expect(r.encaminhamentos[0].motivo).toContain("JEV_URGENCIA_CLINICA");
    expect(r.encaminhamentos[0].motivo).toContain("CANCELAMENTO_SOLICITADO");
  });
}

// Regra de 06/10/2026: dois ou mais atendimentos na mesma mensagem vão para a equipe.
for (const ambiente of ["producao", "homologacao"]) {
  test.each([
    ["multiplos", "quanto custa hemograma e TSH?"],
    ["multiplos", "quero marcar cardiologista e dermatologista"],
    // Foto: a lista lida pelo sistema decide mesmo sem o Jev.
    ["foto_fallback", "Enviei a foto de um pedido médico com: HEMOGRAMA COMPLETO; TSH; GLICOSE."],
  ])(`${ambiente}: %s (%s) encaminha antes de catálogo e agenda`, (caso, mensagem) => {
    const r = simular(ambiente, caso, mensagem);
    expect(r.encaminhamentos).toHaveLength(1);
    expect(r.encaminhamentos[0].motivo).toStartWith("MULTIPLOS_ATENDIMENTOS");
    expect(r.encaminhamentos[0].resumo).toContain("Pedido com dois ou mais atendimentos");
    if (caso === "foto_fallback") expect(r.encaminhamentos[0].motivo).toContain("3 exames");
    expect(r.ferramentas).toEqual(["solicitar_atendente_humano"]);
    expect(r.requests).toHaveLength(0);
    if (ambiente === "homologacao") expect(r.resposta).toContain("simulação");
  });
  test.each([
    ["nova_fallback", "Enviei a foto de um pedido médico com: HEMOGRAMA COMPLETO."],
    ["multiplos_incerto", "quanto custa hemograma e TSH?"],
    ["nova", "quero marcar cardiologista"],
  ])(`${ambiente}: %s (%s) segue com a Nina`, (caso, mensagem) => {
    const r = simular(ambiente, caso, mensagem);
    expect(r.encaminhamentos).toHaveLength(0);
    expect(r.requests).toHaveLength(1);
  });
  test(`${ambiente}: cancelamento junto de outro pedido mantém o motivo de cancelamento`, () => {
    const r = simular(ambiente, "semantica_multiplos", "aquela reserva vai ter que ficar pra semana que vem");
    expect(r.encaminhamentos).toHaveLength(1);
    expect(r.encaminhamentos[0].motivo).toContain("REMARCACAO_SOLICITADA");
    expect(r.encaminhamentos[0].setor).toBe("Agendamento");
  });
}

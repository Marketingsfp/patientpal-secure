import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { motivoSemHorariosHabituais } from "../horarios-habituais";
import type { ResultadoBroker } from "../tool-broker";

const registro = (nome = "Paulo Guilherme", horarios: unknown[] = []) => ({ id: nome, tipo: "profissional", medico: nome,
  extras: { catalogo_tipo: "profissional", horarios } });
const retorno = (records: unknown[], extra = {}): ResultadoBroker => ({ ferramenta: "consultar_cadastro", capacidade: "searchKnowledgeBase",
  fonte: "base_conhecimento", success: true, reused: false, appointment_confirmed: false, dados: { found: true, knowledge_status: "found", records, ...extra } });
const escala = [{ dia: "Quarta-feira", inicio: "07:30", fim: "08:30" }];

test("médico com escala vazia encaminha com causa concreta, mesmo havendo outro médico com horários", () => {
  expect(motivoSemHorariosHabituais(retorno([registro(), registro("André", escala)]))).toContain("HORARIOS_HABITUAIS_NAO_INFORMADOS: Paulo Guilherme");
  expect(motivoSemHorariosHabituais(retorno([registro(), registro("André", escala)]), ["André"])).toBeNull();
  expect(motivoSemHorariosHabituais(retorno([registro()]), ["referencia-de-outra-consulta"])).toContain("Paulo Guilherme");
});
test("escala incompleta, desconhecida ou somente modalidade não vira horário habitual", () => {
  for (const horarios of [[], [{}], [{ dia: "Quarta-feira" }], [{ dia: "Horários não informados", inicio: "08:00" }]])
    expect(motivoSemHorariosHabituais(retorno([registro("Paulo", horarios)]))).toContain("Paulo");
});
test("horários estruturados, período publicado e escala legada preservam atendimento automático", () => {
  for (const r of [registro("Paulo", escala), registro("Paulo", [{ dia: "Quarta-feira", observacao: "Pela manhã" }]),
    { ...registro(), dia: "Terças de manhã" }, { ...registro(), extras: { horarios: [], observacao_publica: "Quarta das 08h às 12h" } }])
    expect(motivoSemHorariosHabituais(retorno([r]))).toBeNull();
  // Homônimos com IDs diferentes não podem emprestar a escala um ao outro.
  expect(motivoSemHorariosHabituais(retorno([registro(), { ...registro("Paulo Guilherme", escala), id: "homonimo" }]))).toContain("Paulo Guilherme");
});
test("retorno parcial, serviço, ambiguidade e falha de leitura não comprovam escala ausente", () => {
  expect(motivoSemHorariosHabituais(retorno([{ tipo: "profissional", medico: "Paulo" }]))).toBeNull();
  expect(motivoSemHorariosHabituais(retorno([{ tipo: "servico", procedimento: "ECG", extras: { horarios: [] } }]))).toBeNull();
  expect(motivoSemHorariosHabituais(retorno([registro()], { esclarecimento: { pergunta: "Qual médico?" } }))).toBeNull();
  expect(motivoSemHorariosHabituais(retorno([registro()], { found: false, knowledge_status: "not_found" }))).toBeNull();
  expect(motivoSemHorariosHabituais({ ...retorno([registro()]), success: false, erro: "INTERNAL_ERROR" })).toBeNull();
});

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
for (const ambiente of ["producao", "homologacao"])
  for (const caso of ["normal", "falha_handoff", "obsoleto"])
    test(`${ambiente}: núcleo interrompe modelo que tenta consultar agenda sem escala (${caso})`, () => {
      const p = Bun.spawnSync([process.execPath, fixture, ambiente, `catalogo_sem_escala_${caso}`], { stdout: "pipe", stderr: "pipe", timeout: 15000 });
      expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
      const linha = p.stdout.toString().split(/\r?\n/).find(l => l.startsWith("DIRETA_RESULTADO="))!;
      const r = JSON.parse(linha.slice("DIRETA_RESULTADO=".length));
      expect(r.requests).toHaveLength(1);
      expect(r.ferramentas).not.toContain("consultar_disponibilidade");
      expect(r.ferramentas).not.toContain("agendar");
      expect(r.rede).toBe(0);
      if (caso === "obsoleto") {
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.resposta).toBe("");
      } else {
        expect(r.encaminhamentos).toHaveLength(1);
        expect(r.encaminhamentos[0].motivo).toContain("HORARIOS_HABITUAIS_NAO_INFORMADOS");
        expect(r.encaminhamentos[0].motivo).toContain("Paulo Guilherme");
        expect(r.resposta).not.toContain("Vou consultar a agenda");
        if (caso === "falha_handoff") expect(r.resposta).toContain("Não consegui");
        else expect(r.resposta).toContain(ambiente === "homologacao" ? "simulação" : "Encaminhei");
      }
    });

import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { motivoSemHorariosHabituais, orientacaoHorariosHabituais } from "../horarios-habituais";
import type { ResultadoBroker } from "../tool-broker";

const registro = (nome = "Paulo Guilherme", horarios: unknown[] = []) => ({
  id: nome,
  tipo: "profissional",
  medico: nome,
  extras: { catalogo_tipo: "profissional", horarios },
});
const retorno = (records: unknown[], extra = {}): ResultadoBroker => ({
  ferramenta: "consultar_cadastro",
  capacidade: "searchKnowledgeBase",
  fonte: "base_conhecimento",
  success: true,
  reused: false,
  appointment_confirmed: false,
  dados: { found: true, knowledge_status: "found", records, ...extra },
});
const escala = [{ dia: "Quarta-feira", inicio: "07:30", fim: "08:30" }];

test("apresentação genérica separa escala confirmada, ausente e leitura parcial sem alterar a fonte", () => {
  const r = retorno([
    registro("Eneida", escala),
    registro("Mauricio"),
    { id: "parcial", tipo: "profissional", medico: "Andrea" },
    { ...registro("Legado"), dias_horarios: "Terça-feira das 08h às 12h" },
  ]);
  const antes = structuredClone(r);
  expect(orientacaoHorariosHabituais(r)).toMatchObject({
    com_horarios: [
      { registro: "Eneida", nome: "Eneida" },
      { registro: "Legado", nome: "Legado" },
    ],
    sem_horarios: [{ registro: "Mauricio", nome: "Mauricio" }],
    nao_verificados: [{ registro: "parcial", nome: "Andrea" }],
  });
  expect(r).toEqual(antes);
  expect(orientacaoHorariosHabituais(retorno([registro()], { esclarecimento: {} }))).toBeNull();
  expect(orientacaoHorariosHabituais({ ...r, success: false })).toBeNull();
  expect(orientacaoHorariosHabituais({ ...r, capacidade: "checkAvailability" })).toBeNull();
});

test("falta de escala só encaminha o médico identificado; busca ampla não escolhe por conta própria", () => {
  expect(motivoSemHorariosHabituais(retorno([registro(), registro("André", escala)]))).toBeNull();
  expect(
    motivoSemHorariosHabituais(retorno([registro(), registro("André", escala)]), [
      "Paulo Guilherme",
    ]),
  ).toContain("HORARIOS_HABITUAIS_NAO_INFORMADOS: Paulo Guilherme");
  expect(
    motivoSemHorariosHabituais(retorno([registro(), registro("André", escala)]), ["André"]),
  ).toBeNull();
  expect(
    motivoSemHorariosHabituais(retorno([registro()]), ["referencia-de-outra-consulta"]),
  ).toBeNull();
});
test("escala incompleta, desconhecida ou somente modalidade não vira horário habitual", () => {
  for (const horarios of [
    [],
    [{}],
    [{ dia: "Quarta-feira" }],
    [{ dia: "Horários não informados", inicio: "08:00" }],
  ])
    expect(motivoSemHorariosHabituais(retorno([registro("Paulo", horarios)]))).toContain("Paulo");
});
test("horários estruturados, período publicado e escala legada preservam atendimento automático", () => {
  for (const r of [
    registro("Paulo", escala),
    registro("Paulo", [{ dia: "Quarta-feira", observacao: "Pela manhã" }]),
    { ...registro(), dia: "Terças de manhã" },
    { ...registro(), extras: { horarios: [], observacao_publica: "Quarta das 08h às 12h" } },
  ])
    expect(motivoSemHorariosHabituais(retorno([r]))).toBeNull();
  // Homônimos com IDs diferentes não podem emprestar a escala um ao outro.
  expect(
    motivoSemHorariosHabituais(
      retorno([registro(), { ...registro("Paulo Guilherme", escala), id: "homonimo" }]),
      ["Paulo Guilherme"],
    ),
  ).toContain("Paulo Guilherme");
});
test("retorno parcial, serviço, ambiguidade e falha de leitura não comprovam escala ausente", () => {
  expect(
    motivoSemHorariosHabituais(retorno([{ tipo: "profissional", medico: "Paulo" }])),
  ).toBeNull();
  expect(
    motivoSemHorariosHabituais(
      retorno([{ tipo: "servico", procedimento: "ECG", extras: { horarios: [] } }]),
    ),
  ).toBeNull();
  expect(
    motivoSemHorariosHabituais(
      retorno([registro()], { esclarecimento: { pergunta: "Qual médico?" } }),
    ),
  ).toBeNull();
  expect(
    motivoSemHorariosHabituais(
      retorno([registro()], { found: false, knowledge_status: "not_found" }),
    ),
  ).toBeNull();
  expect(
    motivoSemHorariosHabituais({
      ...retorno([registro()]),
      success: false,
      erro: "INTERNAL_ERROR",
    }),
  ).toBeNull();
});

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
for (const ambiente of ["producao", "homologacao"])
  for (const caso of [
    "clinico",
    "urologia",
    "dermatologia",
    "otorrino",
    "cardiologia",
    "escolhido_sem",
  ])
    test(`${ambiente}: escala respeita escopo do pedido (${caso})`, () => {
      const p = Bun.spawnSync(
        [process.execPath, fixture, ambiente, `catalogo_escopo_escala_${caso}`],
        { stdout: "pipe", stderr: "pipe", timeout: 15000 },
      );
      expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
      const linha = p.stdout
        .toString()
        .split(/\r?\n/)
        .find((l) => l.startsWith("DIRETA_RESULTADO="))!;
      const r = JSON.parse(linha.slice("DIRETA_RESULTADO=".length));
      expect(r.rede).toBe(0);
      expect(r.ferramentas).not.toContain("agendar");
      if (caso === "escolhido_sem") {
        expect(r.encaminhamentos).toHaveLength(1);
        expect(r.encaminhamentos[0].motivo).toContain("Nicolas Cesar Alves Nunes");
        expect(r.requests).toHaveLength(1);
      } else {
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.ferramentas).toContain("buscar_medicos");
        expect(r.requests).toHaveLength(3);
        expect(r.resposta).toContain("Horários habituais");
        if (caso === "otorrino") {
          const retornos = r.requests
            .at(-1)
            .messages.filter((m: any) => m.role === "tool")
            .map((m: any) => JSON.parse(m.content));
          const orientacao = retornos.at(-1).consulta_agenda.apresentacao_profissionais;
          expect(orientacao.com_horarios.map((p: any) => p.nome)).toEqual([
            "Eneida de Oliveira Rodrigues",
          ]);
          expect(orientacao.sem_horarios.map((p: any) => p.nome)).toEqual([
            "Mauricio Albuquerque de Paula",
          ]);
          expect(orientacao.nao_verificados).toEqual([]);
        }
        if (caso === "clinico") {
          const selecao = r.etapas
            .filter((e: any) => e.titulo === "Dados atuais da base compartilhados com a Nina")
            .at(-1).dados.selecao;
          expect(selecao.selecao.medicoNome).toBe("Claudia Maria Rodrigues dos Santos");
        }
      }
    });
for (const ambiente of ["producao", "homologacao"])
  for (const caso of ["normal", "falha_handoff", "obsoleto"])
    test(`${ambiente}: núcleo interrompe modelo que tenta consultar agenda sem escala (${caso})`, () => {
      const p = Bun.spawnSync(
        [process.execPath, fixture, ambiente, `catalogo_sem_escala_${caso}`],
        { stdout: "pipe", stderr: "pipe", timeout: 15000 },
      );
      expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
      const linha = p.stdout
        .toString()
        .split(/\r?\n/)
        .find((l) => l.startsWith("DIRETA_RESULTADO="))!;
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

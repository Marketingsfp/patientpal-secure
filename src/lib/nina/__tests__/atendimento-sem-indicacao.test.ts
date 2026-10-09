import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  PEDIR_NOME_ATENDIMENTO,
  MOTIVO_NOME_NAO_INFORMADO,
  REGRA_SEM_INDICACAO,
  perguntaNomeEntregue,
  semNomePeloJev,
} from "../atendimento-sem-indicacao";
import { motivoParaAtendimento } from "../../atendimento/texto-interno-apresentacao";
import { categoriaDoMotivo } from "../jev-motivo";

const ctx = {
  conversaId: "c",
  inicioSessao: "2026-10-05T12:00:00Z",
  teste: false,
  entradas: ["m2"],
};
const mensagens = (): Array<Parameters<typeof perguntaNomeEntregue>[0][number]> => [
  {
    id: "m1",
    conversa_id: "c",
    created_at: "2026-10-05T12:01:00Z",
    direction: "in",
    body: "Qual médico?",
    is_teste: false,
  },
  {
    id: "p",
    conversa_id: "c",
    created_at: "2026-10-05T12:02:00Z",
    direction: "out",
    body: PEDIR_NOME_ATENDIMENTO,
    enviada_por: "nina",
    status: "sent",
    is_teste: false,
  },
  {
    id: "m2",
    conversa_id: "c",
    created_at: "2026-10-05T12:03:00Z",
    direction: "in",
    body: "não sei",
    is_teste: false,
  },
];
test("ausência de nome é decisão própria, não baixa compreensão", () => {
  expect(semNomePeloJev({ choice: "sem_nome", confidence: 0.98 })).toBe(true);
  for (const r of [
    undefined,
    { choice: "sem_nome", confidence: 0.3 },
    { choice: "informado", confidence: 1 },
    { choice: "outro", confidence: 1 },
  ])
    expect(semNomePeloJev(r)).toBe(false);
  expect(motivoParaAtendimento(MOTIVO_NOME_NAO_INFORMADO)).toContain("após a Nina perguntar");
  expect(categoriaDoMotivo(MOTIVO_NOME_NAO_INFORMADO)).toBe("outro");
});
test("prova exige pergunta enviada na mesma sessão e entrada posterior", () => {
  expect(perguntaNomeEntregue(mensagens(), ctx)).toBe("p");
  expect(perguntaNomeEntregue(mensagens(), { ...ctx, entradas: ["m1", "m2"] })).toBeNull();
  expect(perguntaNomeEntregue(mensagens(), { ...ctx, entradas: [] })).toBeNull();
  expect(
    perguntaNomeEntregue(mensagens(), { ...ctx, inicioSessao: "2026-10-05T12:03:00Z" }),
  ).toBeNull();
  expect(perguntaNomeEntregue(mensagens(), { ...ctx, teste: true })).toBeNull();
});
test.each([
  { status: "pending" },
  { status: "failed" },
  { enviada_por: "humano" },
  { conversa_id: "outra" },
  { body: "Para dor nas costas procure Ortopedia. Qual horário?" },
])("não usa falsa prova %j", (patch) => {
  const m = mensagens();
  m[1] = { ...m[1]!, ...patch };
  expect(perguntaNomeEntregue(m, ctx)).toBeNull();
});

const fixture = fileURLToPath(new URL("./fixtures/resposta-direta.fixture.ts", import.meta.url));
function simular(ambiente: string, caso: string) {
  const p = Bun.spawnSync([process.execPath, fixture, ambiente, `sem_nome_${caso}`], {
    cwd: fileURLToPath(new URL("../../../../../", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
  });
  expect(p.exitCode, p.stdout.toString() + p.stderr.toString()).toBe(0);
  const linha = p.stdout
    .toString()
    .split(/\r?\n/)
    .find((l) => l.startsWith("DIRETA_RESULTADO="));
  expect(linha).toBeDefined();
  return JSON.parse(linha!.slice("DIRETA_RESULTADO=".length));
}
describe("sem indicação clínica no núcleo compartilhado — serviços simulados", () => {
  for (const ambiente of ["producao", "homologacao"]) {
    for (const caso of ["primeira", "segunda_failed", "fallback_primeira"])
      test(`${ambiente}: ${caso} pede nome sem pesquisar`, () => {
        const r = simular(ambiente, caso);
        expect(r.resposta).toContain(PEDIR_NOME_ATENDIMENTO);
        expect(r.resposta).not.toContain("Ortopedia");
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.ferramentas).toHaveLength(0);
        expect(r.rede).toBe(0);
        if (caso.includes("fallback"))
          expect(JSON.stringify(r.requests[0].messages)).toContain(REGRA_SEM_INDICACAO);
        else expect(r.requests).toHaveLength(0);
      });
    for (const caso of ["segunda", "fallback_segunda"])
      test(`${ambiente}: ${caso} encaminha com prova`, () => {
        const r = simular(ambiente, caso);
        expect(r.encaminhamentos).toHaveLength(1);
        expect(r.encaminhamentos[0].motivo).toBe(MOTIVO_NOME_NAO_INFORMADO);
        expect(r.resposta).not.toContain(PEDIR_NOME_ATENDIMENTO);
        expect(r.ferramentas).not.toContain("proxima_vaga");
        expect(r.rede).toBe(0);
        if (ambiente === "homologacao") expect(r.resposta).toContain("simulação");
      });
    for (const caso of ["informado", "outro"])
      test(`${ambiente}: ${caso} prossegue`, () => {
        const r = simular(ambiente, caso);
        expect(r.encaminhamentos).toHaveLength(0);
        expect(r.requests).toHaveLength(1);
        expect(r.resposta).not.toContain(PEDIR_NOME_ATENDIMENTO);
      });
    test(`${ambiente}: preserva pergunta independente nomeada`, () => {
      const r = simular(ambiente, "fallback_misto");
      expect(r.encaminhamentos).toHaveLength(0);
      expect(r.resposta).toContain("Eletrocardiograma: R$ 80,00");
      expect(r.resposta).toContain(PEDIR_NOME_ATENDIMENTO);
      expect(r.ferramentas).toEqual(["consultar_cadastro"]);
    });
    test(`${ambiente}: revisão substituída não envia nem encaminha`, () => {
      const r = simular(ambiente, "segunda_obsoleto");
      expect(r.encaminhamentos).toHaveLength(0);
      expect(r.resposta).toBe("");
    });
    test(`${ambiente}: urgência não espera o nome`, () => {
      const r = simular(ambiente, "urgencia");
      expect(r.encaminhamentos).toHaveLength(1);
      expect(r.encaminhamentos[0].motivo).toContain("JEV_URGENCIA_CLINICA");
      expect(r.requests).toHaveLength(0);
    });
  }
});

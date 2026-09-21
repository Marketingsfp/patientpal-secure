import { describe, expect, it } from "bun:test";
import {
  encaminharAposEsclarecimento,
  MOTIVO_IDENTIFICACAO_PENDENTE,
  prepararSegundaPergunta,
  contarEsclarecimentos,
} from "../catalogo-esclarecimento";
import {
  conhecimentoDaMesmaSessao,
  lembrarConsultaComprovada,
} from "../confidence/conhecimento-sessao";
import { validarResultado } from "../tool-broker";
import { motivoParaAtendimento } from "@/lib/atendimento/texto-interno-apresentacao";

const pendente = lembrarConsultaComprovada({
  clinicaId: "clinica",
  sessionId: "sessao",
  args: { termo: "XYZ" },
  fatos: [],
  esclarecimento: { tipo: "sigla", pergunta: "Qual é o nome por extenso?", opcoes: [] },
})!;
const resultado = (dados: object) =>
  validarResultado("consultar_base_conhecimento", { ok: true, ...dados });
const segunda = prepararSegundaPergunta(
  pendente,
  resultado({ esclarecimento: pendente.esclarecimento }),
);
const duas = lembrarConsultaComprovada({
  clinicaId: "clinica",
  sessionId: "sessao",
  args: { termo: "XYZ" },
  fatos: [],
  anterior: pendente,
  esclarecimento: (segunda.dados as { esclarecimento: NonNullable<typeof pendente.esclarecimento> })
    .esclarecimento,
})!;

describe("até duas perguntas para esclarecer antes de encaminhar", () => {
  it("preserva a pergunta mesmo sem nenhum candidato e isola a sessão", () => {
    expect(pendente).not.toBeNull();
    expect(conhecimentoDaMesmaSessao(pendente, "clinica", "sessao")?.esclarecimento).toEqual(
      pendente.esclarecimento,
    );
    expect(conhecimentoDaMesmaSessao(pendente, "outra", "sessao")).toBeNull();
    expect(conhecimentoDaMesmaSessao(pendente, "clinica", "nova-sessao")).toBeNull();
  });
  it("primeira dúvida faz a pergunta, sem transferir", () => {
    expect(
      encaminharAposEsclarecimento(
        null,
        resultado({ esclarecimento: pendente.esclarecimento }),
        "XYZ",
      ),
    ).toBeNull();
  });
  it.each([
    { esclarecimento: pendente.esclarecimento },
    { found: false, knowledge_status: "not_found", records: [] },
  ])("resposta ainda não identificada vai para humano com motivo interno", (dados) => {
    expect(encaminharAposEsclarecimento(pendente, resultado(dados), "Não sei explicar")).toBeNull();
    const r = encaminharAposEsclarecimento(duas, resultado(dados), "Não sei explicar");
    expect(r?.motivo).toBe(MOTIVO_IDENTIFICACAO_PENDENTE);
    expect(r?.resumo).toContain("XYZ");
    expect(r?.resumo).toContain("Qual é o nome por extenso?");
    expect(r?.resumo).toContain("Não sei explicar");
    expect(motivoParaAtendimento(r?.motivo)).toContain("pediu esclarecimento duas vezes");
    expect(r?.resumo).toContain(duas.esclarecimento!.pergunta);
  });
  it("resposta esclarecida continua o atendimento normalmente", () => {
    expect(
      encaminharAposEsclarecimento(
        pendente,
        resultado({ found: true, knowledge_status: "found" }),
        "Eletrocardiograma",
      ),
    ).toBeNull();
  });
  it("falha técnica não é interpretada como resposta incompreendida", () => {
    expect(
      encaminharAposEsclarecimento(
        pendente,
        validarResultado("consultar_base_conhecimento", { ok: false, erro: "INTERNAL_ERROR" }),
        "USG tireoide",
      ),
    ).toBeNull();
  });
  it("conta perguntas por turno, preserva a contagem salva e interpreta estado legado como uma", () => {
    expect(contarEsclarecimentos(pendente)).toBe(1);
    expect(contarEsclarecimentos(duas)).toBe(2);
    expect(contarEsclarecimentos(conhecimentoDaMesmaSessao(duas, "clinica", "sessao"))).toBe(2);
    expect(contarEsclarecimentos({ esclarecimento: pendente.esclarecimento })).toBe(1);
    expect(duas.esclarecimento!.pergunta).not.toBe(pendente.esclarecimento!.pergunta);
    // Reconsultar no mesmo turno usa sempre o estado de entrada, não gasta outra pergunta.
    expect(
      contarEsclarecimentos(
        lembrarConsultaComprovada({
          clinicaId: "clinica",
          sessionId: "sessao",
          args: { termo: "XYZ" },
          fatos: [],
          anterior: pendente,
          esclarecimento: duas.esclarecimento,
        }),
      ),
    ).toBe(2);
  });
  it("após a primeira resposta não encontrada ainda oferece a segunda pergunta", () => {
    const r = prepararSegundaPergunta(
      pendente,
      resultado({ found: false, knowledge_status: "not_found", records: [] }),
    );
    expect((r.dados as { esclarecimento?: unknown }).esclarecimento).toBeDefined();
    expect(encaminharAposEsclarecimento(pendente, r, "Não sei")).toBeNull();
  });
  it("identificação resolvida após a segunda resposta continua imediatamente", () => {
    const r = resultado({ found: true, knowledge_status: "found", records: [] });
    expect(prepararSegundaPergunta(duas, r)).toBe(r);
    expect(encaminharAposEsclarecimento(duas, r, "Eletrocardiograma")).toBeNull();
    expect(
      lembrarConsultaComprovada({
        clinicaId: "clinica",
        sessionId: "sessao",
        args: { termo: "ECG" },
        fatos: [],
        anterior: duas,
      }),
    ).toBeNull();
    const nova = lembrarConsultaComprovada({
      clinicaId: "clinica",
      sessionId: "sessao",
      args: { termo: "RX" },
      fatos: [],
      anterior: null,
      esclarecimento: pendente.esclarecimento,
    });
    expect(contarEsclarecimentos(nova)).toBe(1);
  });
  it("a segunda pergunta de uma consulta não pede um exame ou pedido médico", () => {
    const consulta = {
      ...pendente,
      consulta: { termo: "cardio", tipo_atendimento: "consulta" as const },
    };
    for (const opcoes of [[], [{ id: "cardio", nome: "Cardiologia" }]]) {
      const r = prepararSegundaPergunta(
        consulta,
        resultado({ esclarecimento: { tipo: "procedimento", opcoes } }),
      );
      const pergunta = (r.dados as { esclarecimento: { pergunta: string } }).esclarecimento
        .pergunta;
      expect(pergunta).toContain("consulta");
      expect(pergunta).not.toContain("exame");
      expect(pergunta).not.toContain("pedido médico");
    }
  });
  it("uma nova sessão não herda as perguntas anteriores e o histórico antigo continua fiel", () => {
    const nova = lembrarConsultaComprovada({
      clinicaId: "clinica",
      sessionId: "outra",
      args: { termo: "XYZ" },
      fatos: [],
      anterior: duas,
      esclarecimento: pendente.esclarecimento,
    });
    expect(contarEsclarecimentos(nova)).toBe(1);
    expect(
      motivoParaAtendimento(
        "CATALOGO_IDENTIFICACAO_NAO_ESCLARECIDA: a Nina pediu esclarecimento uma vez",
      ),
    ).toContain("uma vez");
  });
});

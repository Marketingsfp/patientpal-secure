import { describe, expect, it } from "bun:test";
import {
  encaminharAposEsclarecimento,
  MOTIVO_IDENTIFICACAO_PENDENTE,
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

describe("uma tentativa de esclarecer antes de encaminhar", () => {
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
    const r = encaminharAposEsclarecimento(pendente, resultado(dados), "Não sei explicar");
    expect(r?.motivo).toBe(MOTIVO_IDENTIFICACAO_PENDENTE);
    expect(r?.resumo).toContain("XYZ");
    expect(r?.resumo).toContain("Qual é o nome por extenso?");
    expect(r?.resumo).toContain("Não sei explicar");
    expect(motivoParaAtendimento(r?.motivo)).toContain("pediu esclarecimento uma vez");
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
});

/**
 * FASE 2 (MOTOR DE CONFIABILIDADE) — CORRESPONDÊNCIA FACTUAL.
 *
 * Dados fictícios. Nenhuma mensagem real, nenhum paciente real.
 *
 * O que estes testes travam: endereço, preparo, horário e profissional não
 * podem ser dados como confirmados só porque existe um fato daquele tipo, e
 * preço certo de um procedimento não aprova preço errado de outro.
 */
import { describe, expect, it } from "bun:test";
import {
  correspondenciaDaAfirmacao,
  enderecoNormalizado,
  horasDePreparo,
  mesmaData,
  qualificadoresDaAfirmacao,
  segmentosDaResposta,
  valorDaAfirmacao,
} from "./afirmacao";
import type { FatoRecuperado } from "./evidencia";
import type { ContextoConfianca } from "./types";

const fato = (f: Partial<FatoRecuperado>): FatoRecuperado => ({
  consulta: "buscar_conhecimento",
  capacidade: "searchKnowledgeBase",
  entidade: "procedimento",
  campo: "preco",
  valor: "250,00",
  fonte: "catalogo_publicado",
  ...f,
});

const ctxCom = (
  fatos: FatoRecuperado[],
  extras: Partial<ContextoConfianca> = {},
): ContextoConfianca => ({
  requestedAction: null,
  fatos,
  retrievedSources: [
    { tipo: "catalogo_publicado", referencia: "cat", temConteudo: true, publicado: true },
  ],
  toolResults: [
    {
      nome: "buscar_conhecimento",
      fonte: "catalogo_publicado",
      capacidade: "searchKnowledgeBase",
      success: true,
      temConteudo: true,
      erro: null,
    },
  ],
  businessContext: {
    ambiente: "producao",
    pacienteIdentificado: false,
    agendamentoConfirmado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
  },
  ...extras,
});

describe("leitura da afirmação", () => {
  it("cada afirmação é lida no seu próprio segmento", () => {
    const s = segmentosDaResposta("Ultrassom custa R$ 300; cardiologia custa R$ 250.");
    expect(s).toHaveLength(2);
    expect(s[0]!.texto).toContain("Ultrassom");
    expect(s[1]!.texto).toContain("cardiologia");
  });

  it("extrai qualificadores da própria frase", () => {
    const q = qualificadoresDaAfirmacao(
      "Temos vaga na sexta-feira às 17h com a Dra. Marina na unidade Centro, no cartão",
    );
    expect(q.data).toBe("sexta");
    expect(q.hora).toBe("17:00");
    expect(q.medicoNome).toBe("Marina");
    expect(q.unidadeId?.toLowerCase()).toContain("centro");
    expect(q.condicoes).toBe("cartao");
  });

  it("normaliza preparo, endereço e data", () => {
    expect(horasDePreparo("jejum de 6 horas")).toBe(6);
    expect(valorDaAfirmacao("preparo", "o jejum é de 12 horas")).toBe("12h");
    expect(enderecoNormalizado("Rua das Acácias, 100")?.numero).toBe("100");
    expect(mesmaData("segunda", "2026-09-14")).toBe(true);
    expect(mesmaData("sexta", "2026-09-14")).toBe(false);
  });
});

describe("sem informação suficiente", () => {
  it("afirmação específica sem valor extraível não é confirmada", () => {
    const r = correspondenciaDaAfirmacao(
      [fato({ entidade: "endereco", campo: "endereco", valor: "Rua das Acácias, 100" })],
      {
        tipo: "endereco",
        entidades: ["endereco", "unidade"],
        campos: ["endereco"],
        frase: "Ficamos na Rua ...",
        chave: {},
        valor: null,
      },
    );
    expect(r.situacao).toBe("indeterminado");
  });
});

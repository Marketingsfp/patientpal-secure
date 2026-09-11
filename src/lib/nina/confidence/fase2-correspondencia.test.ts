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
import { avaliarGrounding, type ClaimAvaliado } from "./claims";
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
  retrievedSources: [{ tipo: "catalogo_publicado", referencia: "cat", temConteudo: true, publicado: true }],
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

const do_ = (r: { claims: ClaimAvaliado[] }, tipo: string) => r.claims.filter((c) => c.tipo === tipo);

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

describe("casos obrigatórios da FASE 2 — a resposta contradiz a fonte", () => {
  it("endereço inventado não é confirmado", () => {
    const r = avaliarGrounding(
      ctxCom([fato({ entidade: "endereco", campo: "endereco", valor: "Rua das Acácias, 100" })]),
      "Ficamos na Avenida Inventada, 999.",
    );
    const claims = do_(r, "endereco");
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => !c.suportado)).toBe(true);
    expect(claims.some((c) => c.situacao === "divergente")).toBe(true);
    expect(r.semEvidencia.length).toBeGreaterThan(0);
  });

  it("preparo com jejum diferente do da fonte não é confirmado", () => {
    const r = avaliarGrounding(
      ctxCom([
        fato({
          campo: "preparo",
          valor: "jejum de 6 horas",
          chave: { procedimento: "Ultrassom" },
          registro: "reg-1",
        }),
      ]),
      "Para o ultrassom o jejum é de 12 horas.",
    );
    const c = do_(r, "preparo")[0]!;
    expect(c.situacao).toBe("divergente");
    expect(c.suportado).toBe(false);
    expect(c.valorDaFonte).toBe("jejum de 6 horas");
    expect(c.referencia).toContain("reg-1");
  });

  it("horário diferente da vaga recuperada não é confirmado", () => {
    const r = avaliarGrounding(
      ctxCom([
        fato({
          consulta: "consultar_agenda",
          capacidade: "checkAvailability",
          fonte: "agenda",
          entidade: "vaga",
          campo: "slot",
          valor: "2026-09-14 08:00",
          chave: { data: "2026-09-14", hora: "08:00" },
        }),
      ]),
      "Temos vaga na sexta-feira às 17h.",
    );
    const claims = do_(r, "disponibilidade");
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.every((c) => !c.suportado)).toBe(true);
    expect(claims.some((c) => c.situacao === "fora_do_escopo")).toBe(true);
  });

  it("preços trocados entre procedimentos não recebem aprovação factual", () => {
    const r = avaliarGrounding(
      ctxCom([
        fato({ valor: "250,00", registro: "u", chave: { procedimento: "Ultrassom" } }),
        fato({ valor: "300,00", registro: "c", chave: { especialidade: "Cardiologia" } }),
      ]),
      "O ultrassom custa R$ 300; a cardiologia custa R$ 250.",
    );
    const claims = do_(r, "valor");
    expect(claims).toHaveLength(2);
    expect(claims.every((c) => !c.suportado)).toBe(true);
    expect(claims.every((c) => c.situacao === "divergente")).toBe(true);
  });
});

describe("versões corretas e equivalências legítimas", () => {
  it("endereço correto é confirmado, com referência do fato", () => {
    const r = avaliarGrounding(
      ctxCom([
        fato({
          entidade: "endereco",
          campo: "endereco",
          valor: "Rua das Acácias, 100",
          registro: "end-1",
        }),
      ]),
      "Ficamos na Rua das Acacias, 100.",
    );
    const c = do_(r, "endereco")[0]!;
    expect(c.situacao).toBe("confirmado");
    expect(c.referencia).toContain("end-1");
  });

  it("preços corretos por procedimento são confirmados", () => {
    const r = avaliarGrounding(
      ctxCom([
        fato({ valor: "250,00", chave: { procedimento: "Ultrassom" } }),
        fato({ valor: "300,00", chave: { especialidade: "Cardiologia" } }),
      ]),
      "O ultrassom custa R$ 250,00; a cardiologia custa R$ 300,00.",
    );
    const claims = do_(r, "valor");
    expect(claims).toHaveLength(2);
    expect(claims.every((c) => c.suportado && c.situacao === "confirmado")).toBe(true);
  });

  it("formato diferente do mesmo valor continua valendo", () => {
    const r = avaliarGrounding(
      ctxCom([fato({ valor: "R$ 1.250,00", chave: { procedimento: "Ressonancia" } })]),
      "A ressonancia custa R$ 1250,00.",
    );
    expect(do_(r, "valor")[0]!.situacao).toBe("confirmado");
  });

  it("preparo em formato equivalente é confirmado", () => {
    const r = avaliarGrounding(
      ctxCom([fato({ campo: "preparo", valor: "jejum de 6 horas", chave: { procedimento: "Ultrassom" } })]),
      "Para o ultrassom, jejum de 6h.",
    );
    expect(do_(r, "preparo")[0]!.situacao).toBe("confirmado");
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

  it("sem fato do campo, a afirmação não é confirmada", () => {
    const r = avaliarGrounding(ctxCom([]), "Ficamos na Rua das Acácias, 100.");
    const c = do_(r, "endereco")[0]!;
    expect(c.suportado).toBe(false);
    expect(["sem_fonte", "nao_verificado"]).toContain(c.situacao);
  });

  it("preço de procedimento não consultado fica fora do escopo", () => {
    const r = avaliarGrounding(
      ctxCom([fato({ valor: "250,00", chave: { procedimento: "Ultrassom" } })]),
      "A mamografia custa R$ 250,00.",
    );
    const c = do_(r, "valor")[0]!;
    expect(c.situacao).toBe("fora_do_escopo");
    expect(c.suportado).toBe(false);
  });
});

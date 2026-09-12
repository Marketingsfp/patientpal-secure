/**
 * FASE 5 — TESTES E ACEITE FINAL do preço por forma de pagamento.
 *
 * Cadeia executada em cada cenário (tudo em memória):
 *
 *   retorno da ferramenta -> normalização (contrato) -> extração das evidências
 *   -> avaliação da resposta (grounding) -> decisão de bloqueio (texto final)
 *
 * Dados fictícios. Sem banco, sem rede, sem modelo vivo, sem mensagem real,
 * sem publicação e sem operação clínica. Reprodução LOCAL — não é conversa
 * executada com a Nina.
 */
import { describe, expect, it } from "bun:test";
import { montarResultadoConhecimento } from "../knowledge-contract";
import { extrairEvidencia, type RetornoFerramenta } from "./evidencia-extrator";
import { avaliarGrounding } from "./claims";
import { verificarRespostaFinal } from "./final-answer";
import type { FatoRecuperado } from "./evidencia";
import type { ContextoConfianca } from "./types";

type Registro = Record<string, unknown>;

function retornoBruto(dados: unknown): RetornoFerramenta {
  return {
    ferramenta: "buscar_conhecimento",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    dados,
    args: { termo: "preco" },
  };
}

/** Caminho oficial: registros -> contrato normalizado -> evidências. */
function fatosDe(registros: Registro[]): FatoRecuperado[] {
  return extrairEvidencia(
    retornoBruto(
      montarResultadoConhecimento({ registros, base: { versao: 6, arquivo: "catalogo.xlsx" } }),
    ),
  ).fatos;
}

function contexto(
  fatos: FatoRecuperado[],
  ambiente: "producao" | "homologacao" = "producao",
): ContextoConfianca {
  return {
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
      ambiente,
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  };
}

function monetariasDeFatos(fatos: FatoRecuperado[], resposta: string) {
  return avaliarGrounding(contexto(fatos), resposta).claims.filter((c) => c.tipo === "valor");
}

function monetarias(registros: Registro[], resposta: string) {
  return monetariasDeFatos(fatosDe(registros), resposta);
}

const ECG: Registro = {
  id: "reg-ecg",
  procedimento: "Eletrocardiograma",
  medico: "Dra. Marina",
  preco_dinheiro: 51,
  preco_cartao: 60,
};

describe("FASE 5 — cenários obrigatórios de aceite", () => {
  it("1. dois preços corretos: nenhuma reprovação monetária", () => {
    const r = monetarias([ECG], "O eletrocardiograma custa R$ 51,00 no dinheiro e R$ 60,00 no cartão.");
    expect(r).toHaveLength(2);
    expect(r.every((c) => c.situacao === "confirmado" && c.suportado)).toBe(true);
    expect(r.map((c) => c.diagnostico?.resultado)).toEqual(["valor_correto", "valor_correto"]);
  });

  it("2. preços trocados: divergência em cada condição", () => {
    const r = monetarias([ECG], "O eletrocardiograma custa R$ 60,00 no dinheiro e R$ 51,00 no cartão.");
    expect(r.map((c) => c.situacao)).toEqual(["divergente", "divergente"]);
    expect(r.map((c) => c.diagnostico?.forma)).toEqual(["dinheiro", "cartao"]);
    expect(r.map((c) => c.diagnostico?.valorEsperado)).toEqual(["51", "60"]);
  });

  it("3. valor inventado no cartão: reprovado", () => {
    const r = monetarias([ECG], "No cartão o eletrocardiograma sai por R$ 999,00.");
    expect(r[0]!.situacao).toBe("divergente");
    expect(r[0]!.suportado).toBe(false);
    expect(r[0]!.diagnostico?.resultado).toBe("valor_divergente");
  });

  it("4. pergunta só sobre dinheiro: a informação pedida é validada", () => {
    const r = monetarias([ECG], "No dinheiro o eletrocardiograma custa R$ 51,00.");
    expect(r).toHaveLength(1);
    expect(r[0]!.situacao).toBe("confirmado");
    expect(r[0]!.diagnostico?.forma).toBe("dinheiro");
  });

  it("5. forma ausente na fonte: preço do cartão não comprovado", () => {
    const r = monetarias(
      [{ id: "r", procedimento: "Eletrocardiograma", preco_dinheiro: 51 }],
      "No cartão o eletrocardiograma custa R$ 51,00.",
    );
    expect(r[0]!.situacao).toBe("fora_do_escopo");
    expect(r[0]!.suportado).toBe(false);
    expect(r[0]!.diagnostico?.resultado).toBe("referencia_ausente");
  });

  it("6. exames diferentes: o número existir na base não comprova", () => {
    const base: Registro[] = [
      { id: "a", procedimento: "Ultrassonografia", preco_dinheiro: 120, preco_cartao: 140 },
      { id: "b", procedimento: "Raio-X", preco_dinheiro: 60, preco_cartao: 75 },
    ];
    const r = monetarias(
      base,
      "A ultrassonografia custa R$ 75,00 no cartão. O raio-x custa R$ 140,00 no cartão.",
    );
    expect(r.map((c) => c.situacao)).toEqual(["divergente", "divergente"]);
  });

  it("7. profissionais diferentes: comparação por executante", () => {
    const base: Registro[] = [
      { id: "m1", procedimento: "Consulta", medico: "Dra. Marina", preco_dinheiro: 200 },
      { id: "m2", procedimento: "Consulta", medico: "Dr. Paulo", preco_dinheiro: 300 },
    ];
    const ok = monetarias(base, "A consulta com a Dra. Marina custa R$ 200,00 no dinheiro.");
    expect(ok[0]!.situacao).toBe("confirmado");
    const erro = monetarias(base, "A consulta com a Dra. Marina custa R$ 300,00 no dinheiro.");
    expect(erro[0]!.situacao).toBe("divergente");
    expect(erro[0]!.diagnostico?.profissional).toContain("Marina");
  });

  it("8. condições explícitas preservadas (à vista x parcelado)", () => {
    // "à vista" é lido como dinheiro e "parcelado" como cartão, conforme cadastro.
    const r = monetarias(
      [ECG],
      "O eletrocardiograma sai por R$ 51,00 à vista e R$ 60,00 parcelado no cartão.",
    );
    expect(r.map((c) => c.diagnostico?.forma)).toEqual(["dinheiro", "cartao"]);
    expect(r.every((c) => c.situacao === "confirmado")).toBe(true);
  });

  it("9. formatos de retorno: records, registros e resumo com detalhes", () => {
    const detalhado = {
      found: true,
      price: "R$ 51,00 (dinheiro) / R$ 60,00 (cartão)",
      registros: [ECG],
      records: [ECG],
    };
    const fatos = extrairEvidencia(retornoBruto(detalhado)).fatos;
    const r = monetariasDeFatos(
      fatos,
      "O eletrocardiograma custa R$ 51,00 no dinheiro e R$ 60,00 no cartão.",
    );
    expect(r.every((c) => c.situacao === "confirmado")).toBe(true);
  });

  it("10. milhar e decimal: R$ 1.500,00 não é truncado", () => {
    const base: Registro[] = [
      { id: "c", procedimento: "Cirurgia de catarata", preco_dinheiro: 1500, preco_cartao: 1650 },
    ];
    const ok = monetarias(base, "A cirurgia de catarata custa R$ 1.500,00 no dinheiro.");
    expect(ok[0]!.situacao).toBe("confirmado");
    const erro = monetarias(base, "A cirurgia de catarata custa R$ 1,50 no dinheiro.");
    expect(erro[0]!.situacao).toBe("divergente");
  });

  it("11. dados equivalentes repetidos não viram conflito artificial", () => {
    const repetido = { found: true, registros: [ECG], records: [{ ...ECG }] };
    const fatos = extrairEvidencia(retornoBruto(repetido)).fatos;
    // Mesma condição + mesmo valor = uma referência só (sem duplicar).
    const cartao = fatos.filter(
      (f) => f.campo === "preco" && (f.chave?.condicoes ?? "").includes("cart"),
    );
    expect(cartao).toHaveLength(1);
    const r = monetariasDeFatos(fatos, "O eletrocardiograma custa R$ 60,00 no cartão.");
    expect(r[0]!.situacao).toBe("confirmado");
  });

  it("12. conflito real: referências equivalentes com valores incompatíveis", () => {
    const conflitante: Registro[] = [
      { id: "x1", procedimento: "Eletrocardiograma", medico: "Dra. Marina", preco_cartao: 60 },
      { id: "x2", procedimento: "Eletrocardiograma", medico: "Dra. Marina", preco_cartao: 80 },
    ];
    const r = monetarias(conflitante, "No cartão o eletrocardiograma custa R$ 70,00.");
    expect(r[0]!.suportado).toBe(false);
    expect(["conflito_referencias", "valor_divergente"]).toContain(
      r[0]!.diagnostico?.resultado ?? "",
    );
  });

  it("13. bloqueio legítimo: valor incorreto produz LOW (produção e homologação)", () => {
    const texto = "No cartão o eletrocardiograma sai por R$ 999,00.";
    const prod = verificarRespostaFinal({ ctx: contexto(fatosDe([ECG])), textoFinal: texto });
    const homolog = verificarRespostaFinal({
      ctx: contexto(fatosDe([ECG]), "homologacao"),
      textoFinal: texto,
    });
    expect(prod.level).toBe("LOW");
    expect(homolog.level).toBe("LOW");
  });

  it("14. outros validadores continuam bloqueando com preços corretos", () => {
    const texto =
      "O eletrocardiograma custa R$ 51,00 no dinheiro e R$ 60,00 no cartão. Já deixei seu exame agendado para amanhã às 9h com a Dra. Marina.";
    const r = avaliarGrounding(contexto(fatosDe([ECG])), texto);
    const valores = r.claims.filter((c) => c.tipo === "valor");
    expect(valores.every((c) => c.suportado)).toBe(true);
    const naoMonetarios = r.claims.filter((c) => c.tipo !== "valor" && !c.suportado);
    expect(naoMonetarios.length).toBeGreaterThan(0);
    const final = verificarRespostaFinal({ ctx: contexto(fatosDe([ECG])), textoFinal: texto });
    expect(final.level).toBe("LOW");
  });
});

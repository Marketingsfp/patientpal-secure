import { describe, expect, it } from "bun:test";
import { avaliarGrounding, extrairClaimsDoTexto } from "./claims";
import { decidirConfianca } from "./engine";
import { extrairEvidencia } from "./evidencia-extrator";
import { construirPlanoFactual } from "./plano-factual";
import { escopoDaEnumeracaoMedica } from "./escopo-enumeracao";
import type { ContextoConfianca } from "./types";

function contexto(): ContextoConfianca {
  const ev = extrairEvidencia({
    ferramenta: "catalogo",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    dados: {
      records: [
        {
          id: "medico-carlos",
          medico: "Carlos Silva",
          procedimento: "Consulta Cardiologia",
          extras: {
            horarios: [
              { dia: "Quarta", inicio: "14:00" },
              { dia: "Quinta", inicio: "08:00" },
            ],
          },
        },
        {
          id: "medico-paulo",
          medico: "Paulo Santos",
          procedimento: "Consulta Cardiologia",
          extras: {
            horarios: [
              { dia: "Quarta", inicio: "13:00" },
              { dia: "Quinta", inicio: "09:00" },
            ],
          },
        },
      ],
    },
  });
  return {
    requestedAction: null,
    tipoAvaliacao: "answer_confidence",
    intent: "informacao",
    turnType: "INFORMACAO",
    fatos: ev.fatos,
    consultas: [ev.consulta],
    toolResults: [],
    retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }],
    businessContext: {
      ambiente: "homologacao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  };
}

const lista = (hora: string) => `Perfeito! O Dr. Carlos Silva realiza atendimentos de:

- **Consulta Cardiologia** (Critério informado: 15 anos)
- **Consulta Cardiologia Infantil** (Critério informado: 1 mês)

Os dias habituais de atendimento dele são:
- **Quartas-feiras** a partir de ${hora}h
- **Quintas-feiras** a partir de 08:00h

Você prefere cardiologia geral ou infantil?`;

describe("lista de horários pertence ao profissional declarado", () => {
  it("sobrenomes completos diferentes não viram um antecedente único pelo primeiro par de palavras", () => {
    const texto =
      "Dr. Carlos Almeida Rocha e Dr. Carlos Almeida Silva atendem aqui.\n\nOs horários dele são:\n- Quartas às 13:00";
    expect(escopoDaEnumeracaoMedica(texto, 3).indeterminado).toBeDefined();
    expect(
      extrairClaimsDoTexto(texto).find((c) => c.tipo === "escala")?.escopoIndeterminado,
    ).toBeDefined();
  });

  it("preserva nome completo com partículas em cada cabeçalho", () => {
    const texto =
      "Dr. Carlos de Almeida Rocha:\n- Quartas às 14:00\n\nDr. Carlos de Almeida Silva:\n- Quartas às 13:00";
    expect(
      extrairClaimsDoTexto(texto)
        .filter((c) => c.tipo === "escala")
        .map((c) => c.chave?.medicoNome),
    ).toEqual(["Carlos de Almeida Rocha", "Carlos de Almeida Silva"]);
    const direto = extrairClaimsDoTexto("Dr. Carlos de Almeida Rocha atende quarta às 14:00.").find(
      (c) => c.tipo === "escala",
    );
    expect(direto?.chave?.medicoNome).toBe("Carlos de Almeida Rocha");
  });

  it("um nome acima do limite vira indeterminado, não um nome parcial reutilizável", () => {
    const nome = Array.from({ length: 35 }, () => "Almeida").join(" ");
    const texto = `Dr. ${nome}:\n- Quartas às 14:00`;
    expect(escopoDaEnumeracaoMedica(texto, 1).indeterminado).toBeDefined();
  });
  it("reproduz o vazamento: quarta 13h do segundo médico não comprova a lista do primeiro", () => {
    const ctx = contexto();
    const r = avaliarGrounding(ctx, lista("13:00"));
    const escala = r.claims.filter((c) => c.tipo === "escala");
    expect(escala).toHaveLength(2);
    expect(escala.some((c) => !c.suportado && c.trecho.includes("quarta"))).toBe(true);
    expect(escala.every((c) => c.trecho.startsWith("Carlos Silva:"))).toBe(true);
    expect(escala.some((c) => c.suportado && c.referencia?.includes("#medico-paulo"))).toBe(false);
    expect(decidirConfianca({ ...ctx, draftText: lista("13:00") }).decision).not.toBe("ALLOW");
  });

  it("aceita os horários realmente publicados para o médico único do bloco", () => {
    const r = avaliarGrounding(contexto(), lista("14:00"));
    expect(r.semEvidencia).toHaveLength(0);
    expect(r.naoVerificados).toHaveLength(0);
    expect(
      r.claims
        .filter((c) => c.tipo === "escala")
        .every((c) => c.referencia?.includes("#medico-carlos")),
    ).toBe(true);
  });

  it("lista diretamente sob o nome preserva o mesmo médico", () => {
    const texto = "**Dr. Carlos Silva:**\n- Quartas às 13:00\n- Quintas às 08:00";
    const r = avaliarGrounding(contexto(), texto);
    expect(r.semEvidencia.some((c) => c.tipo === "escala")).toBe(true);
    expect(
      extrairClaimsDoTexto(texto)
        .filter((c) => c.tipo === "escala")
        .every((c) => c.chave?.medicoNome === "Carlos Silva"),
    ).toBe(true);
  });

  it("duas listas com cabeçalhos próprios não herdam o primeiro médico global", () => {
    const texto = "Dr. Carlos Silva:\n- Quartas às 14:00\n\nDr. Paulo Santos:\n- Quartas às 13:00";
    const r = avaliarGrounding(contexto(), texto);
    const escala = r.claims.filter((c) => c.tipo === "escala");
    expect(escala).toHaveLength(2);
    expect(escala.every((c) => c.suportado)).toBe(true);
    expect(escala.map((c) => c.referencia)).toEqual([
      "catalogo_publicado:catalogo#medico-carlos",
      "catalogo_publicado:catalogo#medico-paulo",
    ]);
  });

  it("o mesmo dia e hora escritos para dois médicos é conferido para ambos", () => {
    const texto = "Dr. Carlos Silva:\n- Quartas às 14:00\n\nDr. Paulo Santos:\n- Quartas às 14:00";
    const r = avaliarGrounding(contexto(), texto);
    const escala = r.claims.filter((c) => c.tipo === "escala");
    expect(escala).toHaveLength(2);
    expect(escala[0]?.suportado).toBe(true);
    expect(escala[1]?.suportado).toBe(false);
  });

  it.each([
    "O Dr. Carlos Silva e o Dr. Paulo Santos atendem aqui.\n\nOs dias habituais de atendimento dele são:\n- Quartas às 13:00",
    "O Dr. Carlos Silva e o Dr. Paulo Santos atendem aqui.\n\nOs dias habituais de atendimento deles são:\n- Quartas às 13:00",
    "Dr. Carlos Silva e Dr. Paulo Santos:\n- Quartas às 13:00",
    "Os dias habituais de atendimento dele são:\n- Quartas às 13:00",
  ])("referência ambígua não permite aproveitar qualquer escala: %s", (texto) => {
    const ctx = contexto();
    const r = avaliarGrounding(ctx, texto);
    expect(r.naoVerificados.some((c) => c.tipo === "escala")).toBe(true);
    expect(decidirConfianca({ ...ctx, draftText: texto }).decision).not.toBe("ALLOW");
  });

  it("nome explícito no item prevalece sobre o cabeçalho e não é sobrescrito pela seleção", () => {
    const ctx = contexto();
    ctx.entities = { medico: "Carlos Silva" };
    const texto = "Dr. Carlos Silva:\n- Quartas às 13:00 com o Dr. Paulo Santos";
    const r = avaliarGrounding(ctx, texto);
    expect(r.claims.find((c) => c.tipo === "escala")?.referencia).toContain("#medico-paulo");
  });

  it("duas sentenças explícitas na mesma linha mantêm seus respectivos nomes", () => {
    const texto = "Dr. Carlos Silva atende quarta às 14h; Dr. Paulo Santos atende quarta às 13h.";
    const r = avaliarGrounding(contexto(), texto);
    expect(r.semEvidencia).toHaveLength(0);
    expect(r.naoVerificados).toHaveLength(0);
    expect(r.claims.filter((c) => c.tipo === "escala")).toHaveLength(2);
  });

  it("cabeçalho canônico continua como referência textual mesmo após sua conferência direta", () => {
    const ctx = contexto();
    const profissional = construirPlanoFactual(ctx).itens.find(
      (item) => item.claim.tipo === "profissional" && item.registro === "medico-carlos",
    )!;
    const texto =
      profissional.claim.texto +
      "\n\nOs dias habituais de atendimento dele são:\n- Quartas às 13:00";
    const r = avaliarGrounding(ctx, texto);
    expect(r.claims.some((c) => c.origem === "estruturado" && c.tipo === "profissional")).toBe(
      true,
    );
    expect(r.semEvidencia.some((c) => c.tipo === "escala")).toBe(true);
  });
});

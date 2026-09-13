import { describe, expect, it } from "bun:test";
import { avaliarGrounding, extrairClaimsDoTexto } from "./claims";
import { extrairEvidencia } from "./evidencia-extrator";
import { horariosSemanais } from "./escala-publicada";
import type { ContextoConfianca } from "./types";

const registros = [
  {
    id: "medica-a",
    procedimento: "Consulta Cardiologia",
    medico: "Marina Oliveira",
    dia: "Segunda a Sábado 09:30h",
    extras: { horarios: [{ dia: "Segunda a Sábado", inicio: "09:30" }] },
  },
  {
    id: "medico-b",
    procedimento: "Consulta Cardiologia",
    medico: "Bruno Costa",
    dia: "Quinta 13:30h",
  },
  {
    id: "medico-c",
    procedimento: "Consulta Cardiologia",
    medico: "Carlos Silva",
    dia: "Quarta 13h, Quinta 08h, Sexta 13h, Sábado 08h",
    extras: {
      horarios: [
        { dia: "Quarta", inicio: "13:00" },
        { dia: "Quinta", inicio: "08:00" },
        { dia: "Sexta", inicio: "13:00" },
        { dia: "Sábado", inicio: "08:00" },
      ],
    },
  },
  {
    id: "medico-d",
    procedimento: "Consulta Cardiologia",
    medico: "Daniel Souza",
    dia: "Segunda 09:30h",
  },
  ...["ELETROCARDIOGRAMA", "ECOCARDIOGRAMA", "HOLTER 24H", "MAPA 24H", "TESTE ERGOMETRICO"].map(
    (nome, i) => ({ id: `exame-${i}`, procedimento: nome }),
  ),
];

function contexto(records: unknown[] = registros): ContextoConfianca {
  const evidencia = extrairEvidencia({
    ferramenta: "consultar_base_conhecimento",
    capacidade: "searchKnowledgeBase",
    fonte: "base_conhecimento",
    success: true,
    dados: {
      fonte: "catalogo_publicado",
      records,
      profissionais: ["Marina Oliveira", "Bruno Costa", "Carlos Silva", "Daniel Souza"],
      especialidades: ["CARDIOLOGIA"],
    },
  });
  return {
    requestedAction: null,
    mensagemPaciente: "Vocês têm cardiologista?",
    intent: "informacao",
    fatos: evidencia.fatos,
    consultas: [evidencia.consulta],
    retrievedSources: [{ tipo: "catalogo_publicado", temConteudo: true, publicado: true }],
    toolResults: [
      {
        nome: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo_publicado",
        success: true,
        temConteudo: true,
      },
    ],
    businessContext: {
      ambiente: "homologacao",
      pacienteIdentificado: false,
      agendamentoConfirmado: false,
      esclarecimentoUsado: false,
      handoffSolicitado: false,
    },
  };
}

describe("escala publicada versus vagas reais", () => {
  it("confere cada médico, dia e hora da resposta geral sem consultar a agenda", () => {
    const resposta = `Sim, temos atendimento em **Cardiologia**!
- **Dra. Marina Oliveira:** de segunda a sábado, a partir das 09:30.
- **Dr. Bruno Costa:** quintas-feiras, a partir das 13:30.
- **Dr. Carlos Silva:** quartas e sextas a partir das 13:00, quintas e sábados a partir das 08:00.
- **Dr. Daniel Souza:** segundas-feiras, a partir das 09:30.
Também realizamos exames cardiológicos (como Eletrocardiograma, Ecocardiograma, Holter, MAPA e Teste Ergométrico).
Gostaria que eu verificasse as vagas disponíveis do Dr. Carlos Silva?`;
    const r = avaliarGrounding(contexto(), resposta);
    expect(r.claims.filter((c) => c.tipo === "escala")).toHaveLength(12);
    expect(r.claims.filter((c) => c.tipo === "servico")).toHaveLength(6);
    expect(r.semEvidencia).toEqual([]);
    expect(r.naoVerificados).toEqual([]);
    expect(r.claims.some((c) => c.tipo === "disponibilidade")).toBe(false);
  });

  it.each([
    "Dr. Bruno Costa atende quinta às 17h.",
    "Dr. Bruno Costa atende segunda às 09:30.",
    "Dr. Profissional Inventado atende quinta às 13:30.",
    "Dr. Carlos Silva atende quartas e sextas às 13h, quintas e sábados às 10h.",
  ])("reprova horário, dia ou médico divergente: %s", (resposta) => {
    const r = avaliarGrounding(contexto(), resposta);
    expect(r.semEvidencia.some((c) => c.tipo === "escala")).toBe(true);
  });

  it("não usa escala global sem médico para apoiar horário de um médico", () => {
    const ctx = contexto();
    ctx.fatos = [
      {
        consulta: "base",
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo_publicado",
        entidade: "escala",
        campo: "dia_atendimento",
        valor: "Quinta 13:30h",
      },
    ];
    expect(
      avaliarGrounding(ctx, "Dr. Bruno Costa atende quinta às 13:30.").semEvidencia.some(
        (c) => c.tipo === "escala",
      ),
    ).toBe(true);
  });

  it("dias habituais sem horário também são conferidos no catálogo", () => {
    const r = avaliarGrounding(contexto(), "O Dr. Bruno Costa atende às quintas-feiras.");
    expect(r.claims.some((c) => c.tipo === "escala" && c.suportado)).toBe(true);
    expect(r.semEvidencia).toEqual([]);
  });

  it("nesta clínica não transforma escala habitual em vaga nesta data", () => {
    const r = avaliarGrounding(
      contexto(),
      "Nesta clínica, o Dr. Bruno Costa atende quinta às 13:30.",
    );
    expect(r.semEvidencia).toEqual([]);
    expect(r.claims.some((c) => c.tipo === "escala" && c.suportado)).toBe(true);
    expect(r.claims.some((c) => c.tipo === "disponibilidade")).toBe(false);
  });

  it("reconhecer uma oferta não aprova especialidade sem dados nem unidade inventada", () => {
    const ctx = contexto();
    ctx.fatos = undefined;
    expect(
      avaliarGrounding(ctx, "Sim, atendemos cardiologia.").naoVerificados.length,
    ).toBeGreaterThan(0);
    expect(
      avaliarGrounding(contexto(), "Sim, atendemos cardiologia na unidade Inexistente.")
        .semEvidencia.length,
    ).toBeGreaterThan(0);
  });

  it("não transforma atendimento no primeiro sábado em todos os sábados", () => {
    const ctx = contexto([
      {
        id: "restrito",
        medico: "Bruno Costa",
        procedimento: "Consulta Cardiologia",
        dia: "Sábado 13:30",
        extras: { horarios: [{ dia: "Sábado", inicio: "13:30", recorrencia: "Primeiro sábado" }] },
      },
    ]);
    const r = avaliarGrounding(ctx, "O Dr. Bruno Costa atende aos sábados às 13:30.");
    expect(r.semEvidencia.some((c) => c.tipo === "escala")).toBe(true);
    const correta = avaliarGrounding(ctx, "O Dr. Bruno Costa atende no primeiro sábado às 13:30.");
    expect(correta.semEvidencia).toEqual([]);
  });

  it.each([
    "Temos vaga quinta às 13:30 com o Dr. Bruno Costa.",
    "Temos horário quinta às 13:30 com o Dr. Bruno Costa.",
    "O Dr. Bruno Costa está disponível quinta às 13:30.",
    "Dr. Bruno Costa atende no dia 17/09 às 13:30.",
    "O Dr. Bruno Costa pode atender nesta quinta às 13:30.",
  ])("exige agenda para vaga ou data específica: %s", (resposta) => {
    const r = avaliarGrounding(contexto(), resposta);
    expect(r.semEvidencia.some((c) => c.tipo === "disponibilidade")).toBe(true);
    expect(r.claims.some((c) => c.tipo === "escala")).toBe(false);
  });

  it("aceita vaga sustentada por slot da agenda do mesmo médico", () => {
    const ctx = contexto();
    const agenda = extrairEvidencia({
      ferramenta: "consultar_agenda",
      capacidade: "checkAvailability",
      fonte: "agenda",
      success: true,
      dados: {
        horarios: [
          {
            medico: "Bruno Costa",
            data: "2026-09-17",
            hora: "13:30",
            inicio: "2026-09-17T13:30:00",
          },
        ],
      },
    });
    ctx.fatos!.push(...agenda.fatos);
    ctx.retrievedSources.push({ tipo: "agenda", temConteudo: true });
    const r = avaliarGrounding(ctx, "Temos vaga quinta às 13:30 com o Dr. Bruno Costa.");
    expect(r.semEvidencia).toEqual([]);
    expect(r.claims.find((c) => c.tipo === "disponibilidade")?.fonte).toBe("agenda");
  });

  it("oferecer uma consulta futura à agenda não afirma disponibilidade", () => {
    const texto = "Gostaria de verificar se temos vagas na quinta às 13:30 com o Dr. Bruno Costa?";
    expect(avaliarGrounding(contexto(), texto).semEvidencia).toEqual([]);
    expect(
      avaliarGrounding(contexto(), texto).claims.filter((c) => c.tipo === "disponibilidade"),
    ).toEqual([]);
  });

  it("expande intervalo e mantém cada grupo associado ao horário correto", () => {
    expect(horariosSemanais("quartas e sextas às 13h, quintas e sábados às 08h")).toEqual([
      { dia: "quarta", hora: "13:00" },
      { dia: "sexta", hora: "13:00" },
      { dia: "quinta", hora: "08:00" },
      { dia: "sabado", hora: "08:00" },
    ]);
    expect(horariosSemanais("segunda a sábado às 09:30")).toHaveLength(6);
  });

  it("não deixa um exame real sustentar outro exame inventado na mesma lista", () => {
    const r = avaliarGrounding(
      contexto(),
      "Realizamos exames (como Eletrocardiograma, MAPA e Exame Fantasia).",
    );
    expect(r.claims.filter((c) => c.tipo === "servico" && c.suportado)).toHaveLength(2);
    expect(r.semEvidencia).toHaveLength(1);
    expect(r.semEvidencia[0]?.trecho).toContain("Exame Fantasia");
  });

  it("nomes desconhecidos também entram na lista de afirmações", () => {
    expect(
      extrairClaimsDoTexto("Oferecemos exames: Eletrocardiograma e Exame Inexistente.").filter(
        (c) => c.tipo === "servico",
      ),
    ).toHaveLength(2);
  });

  it("retorno canônico doctors/days preserva profissionais e escala em uma única ferramenta", () => {
    const ctx = contexto();
    const e = extrairEvidencia({
      ferramenta: "consultar_base_conhecimento",
      capacidade: "searchKnowledgeBase",
      fonte: "base_conhecimento",
      success: true,
      dados: {
        fonte: "catalogo_publicado",
        records: [
          {
            id: "prof-b",
            procedimento: "Consulta — Cardiologia, Clínico Geral",
            medico: "Bruno Costa",
            dia: "Quinta 13:30h",
            extras: { especialidades: ["Cardiologia", "Clínico Geral"] },
          },
        ],
        doctors: ["Bruno Costa"],
        days: ["Quinta 13:30h"],
      },
    });
    ctx.fatos = e.fatos;
    ctx.consultas = [e.consulta];
    const r = avaliarGrounding(
      ctx,
      "Sim, atendemos cardiologia. O Dr. Bruno Costa atende quinta às 13:30.",
    );
    expect(r.semEvidencia).toEqual([]);
    expect(r.naoVerificados).toEqual([]);
    expect(r.claims.map((c) => c.tipo).sort()).toEqual(["escala", "profissional", "servico"]);
    expect(e.fatos.some((f) => f.entidade === "vaga")).toBe(false);
  });

  it.each([
    "Sim, atendemos cardiologia.",
    "Sim, temos atendimento em Cardiologia na Policlínica Exemplo!",
  ])("valida a especialidade oferecida contra o catálogo: %s", (resposta) => {
    const r = avaliarGrounding(contexto(), resposta);
    expect(r.claims.some((c) => c.tipo === "servico" && c.suportado)).toBe(true);
    expect(r.semEvidencia).toEqual([]);
    expect(r.naoVerificados).toEqual([]);
  });
});

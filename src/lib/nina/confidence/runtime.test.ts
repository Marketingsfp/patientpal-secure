import { describe, expect, it } from "bun:test";
import {
  decidirNoTurno,
  instrucaoEsclarecimentoDirigida,
  montarContextoDoTurno,
  motivoHandoff,
  paraDecisaoLegado,
  resumoHandoffEstruturado,
  validarAgendamentoAntesDoCommit,
  type EstadoDoTurno,
} from "./runtime";

const turno = (over: Partial<EstadoDoTurno> = {}): EstadoDoTurno => ({
  texto: "Oi! Como posso ajudar?",
  mensagemPaciente: "oi",
  // FASE 2 — a ação passa a vir explícita do contexto canônico do turno.
  acao: "responder_informacao",
  ferramentas: [],
  catalogoEncontrou: false,
  agendamentoConfirmado: false,
  pacienteIdentificado: false,
  esclarecimentoUsado: false,
  handoffSolicitado: false,
  ambiente: "homologacao",
  clinicaId: "c1",
  conversaId: "conv-1",
  ...over,
});

const cat = (ok = true) => ({
  nome: "buscar_procedimentos",
  capacidade: "listCatalog",
  fonte: "base_conhecimento",
  success: ok,
  erro: ok ? undefined : "timeout",
});

describe("tradução do turno", () => {
  it("catálogo sem registro não vira fonte com conteúdo", () => {
    const ctx = montarContextoDoTurno(turno({ ferramentas: [cat()], catalogoEncontrou: false }));
    expect(ctx.toolResults[0]?.temConteudo).toBe(false);
  });

  it("ambiente de homologação é preservado", () => {
    const ctx = montarContextoDoTurno(turno());
    expect(ctx.businessContext.ambiente).toBe("homologacao");
  });
});

describe("decisão no turno real", () => {
  it("conversa simples segue normalmente", () => {
    const r = decidirNoTurno(turno());
    expect(r.decision).toBe("ALLOW");
  });

  it("preço sem catálogo publicado transfere", () => {
    const r = decidirNoTurno(turno({ texto: "A ultrassonografia custa R$ 250" }));
    expect(r.decision).toBe("HANDOFF");
    expect(r.hardBlockers).toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
  });

  it("ferramenta com falha nunca vira resposta ao paciente", () => {
    const r = decidirNoTurno(turno({ texto: "Não temos horários", ferramentas: [cat(false)] }));
    expect(r.decision).toBe("HANDOFF");
  });

  it("preço com catálogo publicado é liberado", () => {
    const r = decidirNoTurno(
      turno({
        texto: "A consulta custa R$ 150",
        ferramentas: [cat()],
        catalogoEncontrou: true,
        // FASE 2 — evidência factual propagada pelo servidor.
        fatos: [
          {
            consulta: "consultar_base_conhecimento",
            capacidade: "searchKnowledgeBase",
            entidade: "procedimento",
            campo: "preco",
            valor: "R$ 150,00",
            fonte: "catalogo_publicado",
            chave: { procedimento: "consulta" },
          },
        ],
      }),
    );
    expect(r.decision).toBe("ALLOW");
  });
});

describe("auditoria e handoff", () => {
  it("decisão é convertida para o formato persistido", () => {
    const r = decidirNoTurno(turno({ texto: "A consulta custa R$ 150" }));
    const legado = paraDecisaoLegado(r);
    expect(legado.acao).toBe("transferir");
    expect(legado.bloqueio).toBe("VALOR_SEM_CATALOGO");
    expect(legado.motivos.join(" ")).toContain("MISSING_REQUIRED_OFFICIAL_SOURCE");
  });

  it("resumo do handoff traz intenção, pedido, coletados, motivo e ações", () => {
    const estado = turno({
      texto: "A consulta custa R$ 150",
      mensagemPaciente: "quanto custa a consulta?",
      entities: { procedimento: "consulta cardiologia" },
      ferramentas: [cat(false)],
    });
    const r = decidirNoTurno(estado);
    const resumo = resumoHandoffEstruturado(estado, r);
    expect(resumo).toContain("Pedido do paciente: quanto custa a consulta?");
    expect(resumo).toContain("procedimento: consulta cardiologia");
    expect(resumo).toContain("Motivo da baixa confiança");
    expect(resumo).toContain("buscar_procedimentos");
    expect(motivoHandoff(r)).toContain("Confiabilidade insuficiente");
  });

  it("instrução de esclarecimento pede UMA pergunta apenas", () => {
    const r = decidirNoTurno(
      turno({
        texto: "Seu cadastro está atualizado",
        ferramentas: [
          { nome: "identificar_paciente", capacidade: "getPatient", fonte: "crm", success: true },
        ],
      }),
    );
    const instrucao = instrucaoEsclarecimentoDirigida(r);
    expect(r.decision).toBe("CLARIFY");
    expect(instrucao).toContain("UMA única pergunta");
    expect(instrucao).toContain("Não peça vários dados de uma vez");
  });
});

describe("proteção do agendamento antes da gravação", () => {
  const args = {
    medico_id: "m1",
    inicio: "2026-09-10T13:00:00Z",
    fim: "2026-09-10T13:30:00Z",
    procedimento: "Consulta",
  };

  it("libera com tudo confirmado", () => {
    const r = validarAgendamentoAntesDoCommit({
      args,
      ferramentas: [],
      pacienteIdentificado: true,
      disponibilidadeConfirmada: true,
    });
    expect(r.liberado).toBe(true);
  });

  it("bloqueia sem disponibilidade confirmada em tempo real", () => {
    const r = validarAgendamentoAntesDoCommit({
      args,
      ferramentas: [],
      pacienteIdentificado: true,
      disponibilidadeConfirmada: false,
    });
    expect(r.liberado).toBe(false);
    expect(r.faltas).toContain("disponibilidade_nao_confirmada");
  });

  it("bloqueia sem paciente identificado e com campo faltando", () => {
    const r = validarAgendamentoAntesDoCommit({
      args: { ...args, procedimento: "" },
      ferramentas: [],
      pacienteIdentificado: false,
      disponibilidadeConfirmada: true,
    });
    expect(r.faltas).toContain("campo:procedimento");
    expect(r.faltas).toContain("paciente_nao_identificado");
  });

  it("bloqueia horário inconsistente e ferramenta com falha", () => {
    const r = validarAgendamentoAntesDoCommit({
      args: { ...args, fim: "2026-09-10T12:00:00Z" },
      ferramentas: [cat(false)],
      pacienteIdentificado: true,
      disponibilidadeConfirmada: true,
    });
    expect(r.faltas).toContain("horario_inconsistente");
    expect(r.faltas).toContain("ferramenta_com_falha");
  });
});

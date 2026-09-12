/**
 * Regressão — uma saudação simples, respondida com a apresentação correta,
 * NÃO pode ser bloqueada nem encaminhada para uma pessoa em nenhum ambiente.
 *
 * Causa original: uma regra publicada sem como ser conferida virava UNKNOWN,
 * derrubava a cobertura de evidências, rebaixava a nota para Baixa e a regra
 * de baixa confiabilidade descartava o texto e pedia atendente.
 */
import { describe, expect, it } from "bun:test";
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import { montarContextoCanonicoTurno } from "./contexto-turno";
import { verificarRespostaFinalDoTurno, type EstadoDoTurno } from "./runtime";
import { decidirBloqueioBaixaConfianca } from "./baixa-confiabilidade";

const deps = { detectarIntencoes, intencaoAmbigua };

const MENSAGEM = "oi boa tarde";
const RESPOSTA =
  "Olá, boa tarde! Sou a Nina, assistente virtual da Policlínica Menino Jesus. Como posso te ajudar?";

function turnoDeSaudacao() {
  const canonico = montarContextoCanonicoTurno(
    { mensagemPaciente: MENSAGEM, podeAgendar: true },
    deps,
  );
  const estado: EstadoDoTurno = {
    texto: RESPOSTA,
    ferramentas: [],
    catalogoEncontrou: false,
    agendamentoConfirmado: false,
    pacienteIdentificado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
    intent: canonico.intent,
    acao: canonico.requestedAction,
    tipoTurno: canonico.turnType,
    mensagemPaciente: MENSAGEM,
    intentAmbiguo: canonico.intentAmbiguo,
  };
  return { canonico, resultado: verificarRespostaFinalDoTurno(estado, RESPOSTA) };
}

describe("Saudação simples não é bloqueada", () => {
  it("o turno é classificado como saudação, sem ação operacional", () => {
    const { canonico } = turnoDeSaudacao();
    expect(canonico.turnType).toBe("SAUDACAO");
    expect(canonico.requestedAction ?? null).toBeNull();
  });

  it("a conformidade com as instruções não fica em UNKNOWN", () => {
    const { resultado } = turnoDeSaudacao();
    const v = resultado.validators?.find((x) => x.validator === "InstructionComplianceValidator");
    expect(v?.status).not.toBe("UNKNOWN");
  });

  it("em homologação e em produção não há bloqueio nem encaminhamento", () => {
    const { resultado } = turnoDeSaudacao();
    for (const ambiente of ["homologacao", "producao"] as const) {
      const d = decidirBloqueioBaixaConfianca({
        nivel: resultado.level ?? null,
        score: resultado.score ?? null,
        decisaoMotor: resultado.decision ?? null,
        etapa: "ativo",
        ambiente,
        turnoSocialSemAcao: true,
        bloqueadoresAbsolutos: resultado.hardBlockers ?? [],
      });
      expect(d.bloquear).toBe(false);
      expect(d.encaminhar).toBe(false);
    }
  });

  it("a isenção não vale quando existe bloqueador absoluto", () => {
    const d = decidirBloqueioBaixaConfianca({
      nivel: "LOW",
      score: 40,
      decisaoMotor: "HANDOFF",
      etapa: "ativo",
      ambiente: "homologacao",
      turnoSocialSemAcao: true,
      bloqueadoresAbsolutos: ["FONTE_OFICIAL_AUSENTE"],
    });
    expect(d.bloquear).toBe(true);
  });
});

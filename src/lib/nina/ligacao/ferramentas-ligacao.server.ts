/**
 * Execução das ferramentas pedidas pelo modelo de apoio durante a ligação.
 *
 * Leituras (catálogo publicado, profissionais, horários, vagas) usam o MESMO
 * executor do WhatsApp (`executarFerramentaPaciente`), com origem de
 * homologação e sem conversa: nada é gravado e o rastro sai como teste.
 * Gravações, identificação e encaminhamento devolvem resultado simulado.
 */
import { executarFerramentaPaciente } from "../paciente-tools.server";
import { comCatalogoDoTurno } from "../catalogo-turno.server";
import { ferramentasAgendaAtivas } from "../agenda-flag.server";
import { TRANSICAO_AGENDAMENTO_ATIVA } from "../transicao-agendamento";
import { MOTIVO_NOME_NAO_INFORMADO } from "../atendimento-sem-indicacao";
import { ferramentasDaLigacao } from "./contrato-ligacao.server";
import { FERRAMENTAS_SIMULADAS_LIGACAO } from "./config";

/** Acima disso o retorno não cabe numa mensagem do canal de dados da ligação. */
const LIMITE_RETORNO = 100_000;

export type RetornoFerramentaLigacao = {
  /** JSON entregue ao modelo como `function_call_output`. */
  saida: string;
  simulado: boolean;
  /** Preenchido quando a ferramenta foi um encaminhamento (a tela mostra o aviso). */
  encaminhamento: { motivo: string; setor: string | null } | null;
};

function protocoloSimulado(prefixo: string) {
  return `${prefixo}-${Date.now().toString(36).toUpperCase()}`;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Respostas simuladas: mesmo formato que o modelo espera do executor real. */
export function resultadoSimulado(nome: string, args: Record<string, unknown>) {
  switch (nome) {
    case "selecionar_horario":
      return {
        ok: true,
        simulado: true,
        horario_selecionado: true,
        inicio: args.inicio ?? null,
        fim: args.fim ?? null,
      };
    case "consultar_cadastro_paciente":
      return { ok: true, simulado: true, encontrado: false };
    case "identificar_paciente":
      return { ok: true, simulado: true, identificado: true, paciente_id: "PACIENTE-SIMULADO" };
    case "meus_agendamentos":
      return { ok: true, simulado: true, agendamentos: [] };
    case "agendar": {
      const id = protocoloSimulado("AGENDA-SIM");
      return { ok: true, success: true, simulado: true, agendamento_id: id, appointment_id: id };
    }
    case "solicitar_atendente_humano":
      return {
        ok: true,
        simulado: true,
        transferencia_confirmada: true,
        protocolo: protocoloSimulado("ATEND-SIM"),
        setor: texto(args.setor),
      };
    case "solicitar_nome_atendimento":
      return {
        ok: true,
        simulado: true,
        instrucao: `Pergunte uma única vez qual consulta, exame, procedimento ou profissional o paciente deseja, sem indicar por sintomas. Se essa pergunta já foi feita e a resposta ainda não traz o nome, chame solicitar_atendente_humano com o motivo: ${MOTIVO_NOME_NAO_INFORMADO}`,
      };
    default:
      return null;
  }
}

export async function executarFerramentaLigacao(
  clinicaId: string,
  nome: string,
  argumentos: string,
): Promise<RetornoFerramentaLigacao> {
  const podeAgendar = await ferramentasAgendaAtivas(clinicaId);
  const permitidas = new Set(ferramentasDaLigacao(podeAgendar).map((f) => f.function.name));
  if (!permitidas.has(nome))
    return {
      saida: JSON.stringify({
        ok: false,
        erro: "FERRAMENTA_INDISPONIVEL",
        mensagem: "Ferramenta não declarada nesta ligação.",
      }),
      simulado: false,
      encaminhamento: null,
    };

  let args: Record<string, unknown> = {};
  try {
    const lido = argumentos.trim() ? JSON.parse(argumentos) : {};
    if (lido && typeof lido === "object" && !Array.isArray(lido)) args = lido;
  } catch {
    return {
      saida: JSON.stringify({
        ok: false,
        erro: "VALIDATION_ERROR",
        mensagem: "Argumentos inválidos.",
      }),
      simulado: false,
      encaminhamento: null,
    };
  }

  if ((FERRAMENTAS_SIMULADAS_LIGACAO as readonly string[]).includes(nome)) {
    return {
      saida: JSON.stringify(resultadoSimulado(nome, args)),
      simulado: true,
      encaminhamento:
        nome === "solicitar_atendente_humano"
          ? { motivo: texto(args.motivo) ?? "Encaminhamento", setor: texto(args.setor) }
          : null,
    };
  }

  const resultado = await comCatalogoDoTurno(clinicaId, () =>
    executarFerramentaPaciente(
      {
        clinicaId,
        telefone: null,
        pacienteId: null,
        pacienteNome: null,
        conversaId: null,
        origem: "homologacao",
        teste: true,
        podeAgendar,
        agendamentoPorItem: TRANSICAO_AGENDAMENTO_ATIVA,
      },
      nome,
      args,
    ),
  );
  const saida = JSON.stringify(resultado);
  return {
    saida:
      saida.length <= LIMITE_RETORNO
        ? saida
        : JSON.stringify({
            ok: false,
            erro: "RETORNO_EXTENSO",
            mensagem:
              "O retorno é grande demais para a ligação. Refaça a pesquisa de forma mais específica.",
          }),
    simulado: false,
    encaminhamento: null,
  };
}

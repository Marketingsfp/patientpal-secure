import type { CtxNinaPaciente } from "./paciente-tools.server";
import { catalogoDoTurno } from "./catalogo-turno.server";
import { servicoParaRegistro } from "./catalogo-conhecimento";
import { procedimentoDaSessao } from "./procedimento-sessao";
import { avaliarPedidoMedico } from "./pedido-medico";
import type { ModalidadeResolvida } from "./modalidade-atendimento";
import type { RegistroConhecimento } from "./knowledge-contract";

/** Releitura oficial e prova de mídia do servidor; argumentos do modelo não liberam a agenda. */
export async function conferirPedidoMedicoAgenda(
  ctx: CtxNinaPaciente,
  modalidade: ModalidadeResolvida | null,
  candidato?: RegistroConhecimento,
) {
  if (ctx.pedidoMedicoAntesAgenda !== true) return null;
  if (modalidade !== "hora_marcada" && modalidade !== "chegada_com_pre_agendamento") return null;
  const pedido = procedimentoDaSessao(ctx.estado, ctx.clinicaId);
  const id = candidato?.tipo === "servico" ? candidato.id : pedido?.catalogo_id;
  if (!id) return null;
  const catalogo = await catalogoDoTurno(ctx.clinicaId);
  if (catalogo.selecao.fonte !== "base_conhecimento") return null;
  const servico = catalogo.servicos.find((s) => s.id === id);
  if (!servico) throw new Error("O exame não está mais publicado na fonte deste turno.");
  const registro = servicoParaRegistro(servico);
  const solicitacoes = avaliarPedidoMedico(
    {
      found: true,
      knowledge_status: "found",
      fonte_consulta: catalogo.selecao.fonte,
      records: [
        {
          ...registro,
          extras: {
            ...registro.extras,
            atendimentos_publicados: undefined,
            modalidade_atendimento: modalidade,
          },
        },
      ],
    },
    {
      conversaId: ctx.conversaId,
      inicioSessao: ctx.estado?.session_started_at ?? null,
      teste: ctx.teste === true || ctx.origem === "homologacao",
      mensagens: ctx.mensagensPedidoMedico ?? [],
      bloquearAgenda: true,
    },
  );
  if (!solicitacoes.some((s) => s.bloqueia_agenda)) return null;
  return {
    ok: true as const,
    codigo: "PEDIDO_MEDICO_PENDENTE",
    consulta_realizada: false,
    aguardando_paciente: true,
    pedido_medico_do_turno: solicitacoes,
    instrucao:
      "Aguarde a foto legível do pedido deste exame. Não consulte nem ofereça vagas, não selecione horário e não reserve. Responda dúvidas informativas com fatos publicados. Se a foto já foi solicitada, não repita a pergunta nem encaminhe apenas por essa pendência; se ainda não foi solicitada, peça o pedido médico.",
  };
}

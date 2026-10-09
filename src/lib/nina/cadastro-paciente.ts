import { pacienteSchema } from "@/lib/schemas/paciente";
import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";
import { confirmacaoDaEscolha } from "./agendamento-escolha";

/** Mesmas validações dos campos obrigatórios da tela de cadastro do Clínica OS. */
export const cadastroMinimoSchema = pacienteSchema
  .pick({ nome: true, data_nascimento: true, telefone: true })
  .extend({
    data_nascimento: pacienteSchema.shape.data_nascimento.refine((valor) => {
      const data = new Date(`${valor}T12:00:00Z`);
      return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
    }, "Data de nascimento inválida"),
  });
export const CAMPOS_CADASTRO = ["nome", "data_nascimento", "telefone"] as const;
export type CampoCadastro = (typeof CAMPOS_CADASTRO)[number];
export type DadosCadastro = Partial<Record<CampoCadastro, string | null>>;

export function camposCadastroFaltantes(dados: DadosCadastro): CampoCadastro[] {
  return CAMPOS_CADASTRO.filter(
    (campo) => !cadastroMinimoSchema.shape[campo].safeParse(dados[campo] ?? "").success,
  );
}

export function atendimentoDefinido(estado: EstadoFluxoNina | undefined): boolean {
  const a = estado?.appointment;
  return Boolean(
    a &&
    (a.doctor_id || a.doctor_name) &&
    a.slot_inicio &&
    a.slot_fim &&
    (a.procedure || a.specialty) &&
    Date.parse(a.slot_fim) > Date.parse(a.slot_inicio),
  );
}

export function cadastroAutorizado(estado: EstadoFluxoNina | undefined): boolean {
  // A escolha validada permite conferir os dados. A reserva continua exigindo
  // o aceite do resumo entregue depois dessa conferência.
  return atendimentoDefinido(estado) && Boolean(confirmacaoDaEscolha(estado));
}

export const ROTULOS_CADASTRO: Record<CampoCadastro, string> = {
  nome: "*nome completo* da pessoa que será atendida",
  data_nascimento: "*data de nascimento* da pessoa que será atendida",
  telefone: "seu *telefone com DDD*",
};

export const REGRA_CADASTRO_AGENDAMENTO =
  "Após a escolha de uma vaga real, obtenha nome completo e data de nascimento da pessoa que será atendida; aproveite dados já informados. O telefone de contato usa por padrão o número do remetente, inclusive quando um responsável agenda para filha, filho ou outra pessoa. Apresente o campo apenas como Telefone. Não pergunte se deseja alterá-lo: se o paciente confirmar o resumo, siga normalmente. Somente quando o paciente pedir explicitamente, corrija o telefone no cadastro identificado; se faltar o novo número, peça apenas o telefone com DDD. Use identificar_paciente para efetivar a correção autorizada pelo sistema. Depois mostre o resumo atualizado e aguarde sua confirmação antes de agendar. O telefone corrigido não muda o destinatário das mensagens nem a identidade do paciente. Não peça telefone próprio do dependente nem use nome/nascimento do responsável como dados do paciente. Consulte ou cadastre no Clínica OS cruzando nome, nascimento e WhatsApp do remetente. Depois apresente a conferência do paciente e da consulta/exame. Só agende após o paciente aceitar esse resumo; só afirme sucesso depois da gravação confirmada.";

export const EXEMPLOS_CADASTRO: Record<CampoCadastro, string> = {
  nome: "Nome completo: Maria da Silva",
  data_nascimento: "Data de nascimento: 21/10/1999",
  telefone: "Telefone com DDD: (21) 99999-0000",
};

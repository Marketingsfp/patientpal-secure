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

export const REGRA_CADASTRO_AGENDAMENTO = "Após a escolha de uma vaga real, obtenha nome completo e data de nascimento da pessoa que será atendida; aproveite dados já informados. O WhatsApp de contato é sempre o número do remetente recebido pelo sistema, inclusive quando um responsável agenda para filha, filho ou outra pessoa. Não peça telefone próprio do dependente nem use nome/nascimento do responsável como dados do paciente. Consulte ou cadastre no Clínica OS cruzando nome, nascimento e WhatsApp do remetente. Depois apresente a conferência do paciente e da consulta/exame. Só agende após o paciente aceitar esse resumo; só afirme sucesso depois da gravação confirmada.";

export const EXEMPLOS_CADASTRO: Record<CampoCadastro, string> = {
  nome: "João Neves",
  data_nascimento: "21/10/1999",
  telefone: "(21) 99999-0000",
};

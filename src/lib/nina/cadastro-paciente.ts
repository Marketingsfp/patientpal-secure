import { pacienteSchema } from "@/lib/schemas/paciente";
import type { EstadoFluxoNina } from "./fluxo-estado-normalizar";

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
  return atendimentoDefinido(estado) && estado?.appointment.slot_confirmed_by_patient === true;
}

export const ROTULOS_CADASTRO: Record<CampoCadastro, string> = {
  nome: "seu *nome completo*",
  data_nascimento: "sua *data de nascimento* (DD/MM/AAAA)",
  telefone: "seu *telefone com DDD*",
};

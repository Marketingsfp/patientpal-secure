export const DEPARTAMENTOS_INICIAIS = [
  "Recepção",
  "Laboratório",
  "Tomografia e Ressonância",
] as const;

export function descricaoDepartamento(nome: string): string {
  if (nome === "Recepção") return "Setor geral";
  if (nome === "Laboratório") return "Identificado como LAB no painel da TV";
  if (nome === "Tomografia e Ressonância") return "Identificado como TR no painel da TV";
  return "Setor de atendimento";
}

export type DepartamentoZap = { id: string; nome: string; ativo: boolean };
export type AtendenteDepartamento = {
  userId: string;
  nome: string;
  departamentoId: string | null;
  presenca: string | null;
};
export type DadosDepartamentos = {
  departamentos: DepartamentoZap[];
  atendentes: AtendenteDepartamento[];
};

export function podeGerenciarDepartamentos(perfil: string | null | undefined): boolean {
  return perfil === "admin" || perfil === "supervisor";
}

export function rotuloPresencaDepartamento(presenca: string | null): string {
  if (presenca === "ONLINE") return "Online";
  if (presenca === "PAUSA" || presenca === "PAUSA_SAIDA") return "Em pausa";
  return "Offline";
}

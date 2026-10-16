// Regras puras da Área do Paciente (sem rede/banco) — testadas em regras.test.ts.

export const CODIGO_VALIDADE_MIN = 10;
export const CODIGO_MAX_TENTATIVAS = 5;
export const SESSAO_INATIVIDADE_MIN = 30;
export const SESSAO_MAX_HORAS = 8;

/** Limites de pedido de código. */
export const LIMITES = {
  porCpf15min: 3,
  porCpfDia: 10,
  porIp15min: 10,
  /** Códigos queimados por erro que bloqueiam o CPF por 30 min. */
  bloqueiosParaTravar: 3,
} as const;

export const MSG_PENDENCIA =
  "Encontramos uma pendência no seu cadastro. Procure a recepção da clínica para liberar seu acesso.";
export const MSG_CODIGO_INVALIDO = "Código inválido ou expirado. Peça um novo código.";

export function apenasDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** "joao.silva@gmail.com" → "jo***@g***.com". */
export function mascararEmail(email: string): string {
  const [usuario, dominio] = email.trim().toLowerCase().split("@");
  if (!usuario || !dominio) return "***";
  const partes = dominio.split(".");
  const nomeDom = partes.shift() ?? "";
  const resto = partes.length ? "." + partes.join(".") : "";
  return `${usuario.slice(0, 2)}***@${nomeDom.slice(0, 1)}***${resto}`;
}

/** Máscara falsa estável (para CPF sem cadastro), indistinguível da real. */
export function mascaraFalsa(semente: string): string {
  const letras = "abcdefghijklmnoprstuv";
  const a = semente.charCodeAt(0) % letras.length;
  const b = semente.charCodeAt(1) % letras.length;
  const c = semente.charCodeAt(2) % letras.length;
  const doms = [".com", ".com.br"];
  return `${letras[a]}${letras[b]}***@${letras[c]}***${doms[semente.charCodeAt(3) % 2]}`;
}

export function idadeEm(nascimento: string | null | undefined, hoje: Date): number | null {
  if (!nascimento) return null;
  const [y, m, d] = nascimento.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  let idade = hoje.getUTCFullYear() - y;
  const mes = hoje.getUTCMonth() + 1;
  if (mes < m || (mes === m && hoje.getUTCDate() < d)) idade--;
  return idade;
}

export type ContagensPedido = {
  cpf15min: number;
  cpfDia: number;
  ip15min: number;
  bloqueiosRecentes: number;
};

/** null = pode enviar; texto = motivo (só para auditoria, nunca ao paciente). */
export function motivoRecusaPedido(c: ContagensPedido): string | null {
  if (c.bloqueiosRecentes >= LIMITES.bloqueiosParaTravar) return "cpf_bloqueado";
  if (c.ip15min >= LIMITES.porIp15min) return "limite_ip";
  if (c.cpf15min >= LIMITES.porCpf15min) return "limite_cpf_15min";
  if (c.cpfDia >= LIMITES.porCpfDia) return "limite_cpf_dia";
  return null;
}

export function sessaoValida(
  s: { ultimo_uso_em: string; expira_max_em: string; encerrada_em: string | null },
  agora: Date,
): boolean {
  if (s.encerrada_em) return false;
  if (agora.getTime() >= new Date(s.expira_max_em).getTime()) return false;
  return agora.getTime() - new Date(s.ultimo_uso_em).getTime() < SESSAO_INATIVIDADE_MIN * 60_000;
}

export type AgendamentoPortal = {
  inicio: string;
  status: string;
  pago: boolean;
  pacote: boolean;
};

export function podeConfirmar(a: AgendamentoPortal, agora: Date): boolean {
  return a.status === "agendado" && new Date(a.inicio).getTime() > agora.getTime();
}

/** Motivo quando não pode cancelar; null = pode. */
export function motivoNaoCancela(
  a: AgendamentoPortal,
  agora: Date,
  horasMin: number,
): string | null {
  if (!["agendado", "confirmado"].includes(a.status))
    return "Este agendamento não pode mais ser cancelado.";
  if (a.pago) return "Consulta já paga: o cancelamento é feito pela recepção.";
  if (a.pacote) return "Faz parte de um pacote: o cancelamento é feito pela recepção.";
  const limite = new Date(a.inicio).getTime() - horasMin * 3_600_000;
  if (agora.getTime() > limite)
    return `Cancelamento pela internet só até ${horasMin} h antes. Fale com a recepção.`;
  return null;
}

/** Campos que o paciente pode pedir para mudar. */
export const CAMPOS_SOLICITAVEIS = [
  "telefone",
  "email",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
] as const;
export type CampoSolicitavel = (typeof CAMPOS_SOLICITAVEIS)[number];

/** Só o que mudou, já limpo. */
export function diferencasCadastro(
  atual: Partial<Record<CampoSolicitavel, string | null>>,
  novo: Partial<Record<CampoSolicitavel, string | null>>,
): Partial<Record<CampoSolicitavel, string>> {
  const out: Partial<Record<CampoSolicitavel, string>> = {};
  for (const k of CAMPOS_SOLICITAVEIS) {
    if (!(k in novo)) continue;
    let v = (novo[k] ?? "").trim().slice(0, 200);
    if (k === "telefone" || k === "cep") v = apenasDigitos(v);
    if (k === "email") v = v.toLowerCase();
    if (k === "estado") v = v.toUpperCase().slice(0, 2);
    const antes = (atual[k] ?? "").trim();
    const antesCmp = k === "telefone" || k === "cep" ? apenasDigitos(antes) : antes.toLowerCase();
    if (v !== antesCmp && !(k !== "email" && v.toLowerCase() === antes.toLowerCase())) out[k] = v;
  }
  return out;
}

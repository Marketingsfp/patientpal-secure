export type PagadorTipo = "particular" | "associado" | "cartao";

export interface PacienteV2 {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  telefone2?: string | null;
  data_nascimento: string | null;
  email: string | null;
  ativo: boolean;
  codigo_prontuario: string | null;
  codigo_prontuario_anterior?: string | null;
  numero_pasta: string | null;
  cidade: string | null;
  estado: string | null;
  foto_url: string | null;
  created_at: string;
  clinica_id: string;
  associado_convenio?: string | null;
  ultima_consulta?: string | null;
  cadastro_incompleto?: boolean;
  match_reason?: string;
  /** possíveis duplicidades computadas nos resultados visíveis (nome+DN). */
  duplicado_hint?: boolean;
  /** true quando temos indício de cartão de benefícios ativo. */
  tem_cartao_beneficios?: boolean;
}

/** Nunca usar "Convênio" — apenas Particular / Associado / Cartão de Benefícios. */
export function pagadorLabel(p: PacienteV2): { tipo: PagadorTipo; label: string } {
  if (p.tem_cartao_beneficios) return { tipo: "cartao", label: "Cartão de Benefícios" };
  if (p.associado_convenio) return { tipo: "associado", label: `Associado — ${p.associado_convenio}` };
  return { tipo: "particular", label: "Particular" };
}

export function cadastroIncompleto(p: PacienteV2): boolean {
  if (typeof p.cadastro_incompleto === "boolean") return p.cadastro_incompleto;
  const faltas = [!p.cpf, !p.telefone, !p.data_nascimento].filter(Boolean).length;
  return faltas >= 1;
}

export function calcularIdade(nasc: string | null): number | null {
  if (!nasc) return null;
  const [y, m, d] = nasc.split("-").map(Number);
  if (!y || !m || !d) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - y;
  const mm = hoje.getMonth() + 1 - m;
  if (mm < 0 || (mm === 0 && hoje.getDate() < d)) idade -= 1;
  return idade;
}

export function fmtCPF(v: string | null): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length !== 11) return v;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function fmtTel(v: string | null): string {
  if (!v) return "—";
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}

export function fmtNasc(v: string | null): string {
  if (!v) return "—";
  const [y, m, d] = v.split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

/** Marca duplicados dentro do resultado visível (mesmo nome normalizado + DN). */
export function marcarDuplicados<T extends PacienteV2>(rows: T[]): T[] {
  const chave = (p: T) =>
    (p.nome ?? "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().trim() + "|" + (p.data_nascimento ?? "");
  const contagem = new Map<string, number>();
  for (const p of rows) {
    if (!p.data_nascimento) continue;
    const k = chave(p);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  return rows.map((p) => ({ ...p, duplicado_hint: (contagem.get(chave(p)) ?? 0) > 1 }));
}
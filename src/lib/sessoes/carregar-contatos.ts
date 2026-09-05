/**
 * Acesso ao banco do histórico de contato da busca ativa.
 *
 * A tabela `busca_ativa_contatos` é lida direto (sem função), porque a policy
 * de leitura já libera os mesmos três módulos que abrem o relatório —
 * `relatorios`, `financeiro` e `recepcao`. Não é o caso do relatório em si, que
 * precisa de `SECURITY DEFINER` porque as tabelas de sessão estão fechadas pelo
 * módulo `fisioterapia`; ver o comentário de `./carregar-sessoes`.
 *
 * O nome de quem registrou vem numa segunda consulta a `profiles`, e não por
 * join embutido: a coluna aponta para `auth.users`, que o PostgREST não sabe
 * costurar sozinho, e resolver o nome na hora de exibir evita nome congelado
 * quando alguém troca de cadastro.
 */
import { supabase } from "@/integrations/supabase/client";
import { ehResultadoContato, type ContatoBuscaAtiva } from "./busca-ativa-contatos";

/** Quantos registros a tela carrega. Cobre com folga uma lista de faltosos. */
const LIMITE = 500;

/**
 * Contatos dos pacientes que estão na lista, do mais novo para o mais velho.
 *
 * Recebe os ids da lista já exibida em vez de varrer a clínica inteira: a
 * pergunta da tela é sempre "o que já foi tentado com ESTA gente".
 */
export async function carregarContatos(
  clinicaId: string,
  pacienteIds: string[],
): Promise<ContatoBuscaAtiva[]> {
  const ids = [...new Set(pacienteIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("busca_ativa_contatos")
    .select(
      "id, paciente_id, origem, procedimento, resultado, observacao, registrado_por, criado_em",
    )
    .eq("clinica_id", clinicaId)
    .in("paciente_id", ids)
    .order("criado_em", { ascending: false })
    .limit(LIMITE);
  if (error) throw error;

  const linhas = (data ?? []) as Record<string, unknown>[];

  const autores = [...new Set(linhas.map((l) => String(l.registrado_por ?? "")).filter(Boolean))];
  const nomes = new Map<string, string>();
  if (autores.length > 0) {
    // Falha aqui não derruba a tela: o histórico continua útil sem o nome de
    // quem anotou, e o contrário (esconder o registro inteiro) seria pior.
    const { data: perfis } = await supabase.from("profiles").select("id, nome").in("id", autores);
    for (const p of (perfis ?? []) as { id: string; nome: string | null }[]) {
      if (p.nome) nomes.set(p.id, p.nome);
    }
  }

  return linhas.map((l) => ({
    id: String(l.id ?? ""),
    paciente_id: String(l.paciente_id ?? ""),
    origem: l.origem === "pacote" ? "pacote" : "ciclo",
    procedimento: String(l.procedimento ?? ""),
    resultado: ehResultadoContato(l.resultado) ? l.resultado : "outro",
    observacao: String(l.observacao ?? ""),
    registrado_por_nome: nomes.get(String(l.registrado_por ?? "")) ?? "",
    criado_em: String(l.criado_em ?? ""),
  }));
}

/**
 * Grava uma tentativa de contato.
 *
 * `registrado_por` não é enviado de propósito — o banco preenche com
 * `auth.uid()`, então ninguém consegue registrar em nome de outra pessoa nem
 * por engano nem de propósito.
 */
export async function registrarContato(entrada: {
  clinicaId: string;
  pacienteId: string;
  origem: "pacote" | "ciclo";
  procedimento: string;
  resultado: string;
  observacao: string;
}): Promise<void> {
  const { error } = await supabase.from("busca_ativa_contatos").insert({
    clinica_id: entrada.clinicaId,
    paciente_id: entrada.pacienteId,
    origem: entrada.origem,
    procedimento: entrada.procedimento.slice(0, 200),
    resultado: entrada.resultado,
    observacao: entrada.observacao.trim().slice(0, 1000) || null,
  });
  if (error) throw error;
}

/** Dados de contato do paciente, para o painel que abre ao clicar no nome. */
export interface ContatoPaciente {
  id: string;
  nome: string;
  telefone: string | null;
  telefone2: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  codigo_prontuario: string | null;
  codigo_prontuario_anterior: string | null;
  numero_pasta: string | null;
}

export async function carregarContatoPaciente(
  clinicaId: string,
  pacienteId: string,
): Promise<ContatoPaciente | null> {
  const { data, error } = await supabase
    .from("pacientes")
    .select(
      "id, nome, telefone, telefone2, cpf, data_nascimento, codigo_prontuario, codigo_prontuario_anterior, numero_pasta",
    )
    .eq("clinica_id", clinicaId)
    .eq("id", pacienteId)
    .maybeSingle();
  if (error) throw error;
  return (data as ContatoPaciente | null) ?? null;
}

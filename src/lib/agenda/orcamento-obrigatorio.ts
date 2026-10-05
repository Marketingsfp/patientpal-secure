import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getProcedimentosAgenda, type ProcedimentoRef } from "@/lib/agenda/refs-cache";

/**
 * Orçamento obrigatório para cobrar exame e procedimento.
 *
 * Regra do dono (05/10/2026): a cobrança de um EXAME ou PROCEDIMENTO só sai
 * no caixa se a ficha estiver ligada a um orçamento — puxado pelo botão
 * "Agendar" da tela de Orçamentos ou pelo nº do orçamento no campo Paciente
 * da ficha. Consulta, retorno, convênio e mensalidade do cartão ficam de fora
 * de propósito: na época eram ~6.800 cobranças por mês e só 9 tinham
 * orçamento; travar tudo pararia o balcão.
 *
 * O que fica FORA da trava:
 *   - atendimento de convênio (`tipo_atendimento = 'convenio'`);
 *   - ficha que já recebeu alguma parcela — o saldo de um pagamento parcial
 *     antigo continua podendo ser quitado, senão a dívida ficava presa;
 *   - serviço cujo cadastro é ambíguo (o mesmo nome cadastrado como consulta
 *     e como exame, ex.: RISCO CIRURGICO). Na dúvida o caixa não para:
 *     travar uma consulta por engano é pior do que deixar passar um exame.
 *
 * "Ligada a um orçamento" aceita os dois vínculos que existem no banco:
 * `agendamentos.orcamento_id` e as linhas de `agendamento_orcamento_itens` /
 * `orcamento_itens.agendamento_id` (há fichas só com o segundo).
 */

export const MSG_ORCAMENTO_OBRIGATORIO =
  "Cobrança não permitida: É obrigatório vincular um Orçamento a este atendimento.";

export const COMO_VINCULAR_ORCAMENTO =
  "Exame e procedimento só são cobrados com orçamento. Abra a ficha, busque o nº do orçamento no campo Paciente e salve — ou use o botão Agendar na tela de Orçamentos.";

/** Aviso padrão do bloqueio, igual em todas as telas de cobrança. */
export function avisarOrcamentoObrigatorio(): void {
  toast.error(MSG_ORCAMENTO_OBRIGATORIO, { description: COMO_VINCULAR_ORCAMENTO, duration: 10000 });
}

const TIPOS_QUE_EXIGEM = new Set(["exame", "procedimento"]);

/** Maiúsculas, sem acento e sem espaço sobrando — para comparar nomes. */
function chave(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
}

export type IndiceServicos = Map<string, Array<{ tipo: string; grupo: string }>>;

export function indexarServicos(rows: ProcedimentoRef[]): IndiceServicos {
  const idx: IndiceServicos = new Map();
  for (const r of rows) {
    const k = chave(r.nome);
    if (!k) continue;
    const lista = idx.get(k) ?? [];
    lista.push({ tipo: (r.tipo ?? "").trim().toLowerCase(), grupo: chave(r.grupo) });
    idx.set(k, lista);
  }
  return idx;
}

/**
 * O serviço escrito na ficha é exame/procedimento SEM ambiguidade?
 *
 * A ficha guarda "NOME (ESPECIALIDADE)" e o cadastro guarda só "NOME" — mesma
 * busca em dois passos de `tipoDoProcedimento` (composicao-receita.ts): tenta
 * o nome inteiro (há nomes que terminam em parênteses de verdade) e depois sem
 * o último parêntese, usando a especialidade para escolher o cadastro certo.
 */
function parteExigeOrcamento(texto: string, idx: IndiceServicos): boolean {
  const cheio = chave(texto);
  if (!cheio) return false;
  let candidatos = idx.get(cheio);
  if (!candidatos) {
    const m = cheio.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    if (!m) return false;
    const base = idx.get(m[1].trim());
    if (!base) return false;
    const daEspecialidade = base.filter((c) => c.grupo === m[2].trim());
    candidatos = daEspecialidade.length > 0 ? daEspecialidade : base;
  }
  return candidatos.length > 0 && candidatos.every((c) => TIPOS_QUE_EXIGEM.has(c.tipo));
}

export type FichaCobranca = {
  procedimento: string | null;
  tipo_atendimento: string | null;
  /** Já ligada a um orçamento por qualquer um dos vínculos. */
  temOrcamento: boolean;
  /** Já recebeu alguma parcela (saldo de pagamento parcial). */
  jaRecebeu: boolean;
};

export function fichaExigeOrcamento(f: FichaCobranca, idx: IndiceServicos): boolean {
  if (f.temOrcamento || f.jaRecebeu) return false;
  if ((f.tipo_atendimento ?? "").toLowerCase() === "convenio") return false;
  // Laboratório concatenado: "HEMOGRAMA + GLICEMIA + TSH".
  const partes = (f.procedimento ?? "").split(/\s+\+\s+/).filter((p) => p.trim());
  return partes.some((p) => parteExigeOrcamento(p, idx));
}

/**
 * Das fichas informadas, devolve as que NÃO podem ser cobradas por falta de
 * orçamento. Lê tudo fresco do banco: a ficha pode ter acabado de ser ligada
 * ao orçamento em outra tela.
 */
export async function fichasSemOrcamentoObrigatorio(
  clinicaId: string,
  agendamentoIds: string[],
): Promise<string[]> {
  const ids = Array.from(new Set(agendamentoIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const [ags, vinc, itens, receb, servicos] = await Promise.all([
    supabase
      .from("agendamentos")
      .select("id, procedimento, tipo_atendimento, orcamento_id")
      .in("id", ids),
    supabase.from("agendamento_orcamento_itens").select("agendamento_id").in("agendamento_id", ids),
    supabase.from("orcamento_itens").select("agendamento_id").in("agendamento_id", ids),
    supabase
      .from("fin_lancamentos")
      .select("agendamento_id")
      .eq("tipo", "receita")
      .neq("status", "cancelado")
      .in("agendamento_id", ids),
    getProcedimentosAgenda(clinicaId),
  ]);
  if (ags.error) throw ags.error;
  if (vinc.error) throw vinc.error;
  if (itens.error) throw itens.error;
  if (receb.error) throw receb.error;
  const ligadas = new Set<string>();
  for (const r of [...(vinc.data ?? []), ...(itens.data ?? [])]) {
    if (r.agendamento_id) ligadas.add(r.agendamento_id);
  }
  const recebidas = new Set(
    (receb.data ?? []).map((r) => r.agendamento_id).filter((x): x is string => !!x),
  );
  const idx = indexarServicos(servicos);
  return (ags.data ?? [])
    .filter((a) =>
      fichaExigeOrcamento(
        {
          procedimento: a.procedimento,
          tipo_atendimento: a.tipo_atendimento,
          temOrcamento: !!a.orcamento_id || ligadas.has(a.id),
          jaRecebeu: recebidas.has(a.id),
        },
        idx,
      ),
    )
    .map((a) => a.id);
}

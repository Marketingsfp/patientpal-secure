// Cálculo do repasse do médico para atendimentos externos (GR de outra
// clínica). Base = preço do serviço na tabela DESTA clínica; a regra segue o
// cadastro de repasse do médico (por serviço, por categoria, convênio/cartão
// ou padrão). Client-safe: usa o supabase do browser.
import { supabase } from "@/integrations/supabase/client";
import {
  calcRepasseFull,
  normRepasse,
  type RepasseCtx,
  type RepasseConvenio,
  type RepasseMedico,
} from "@/lib/repasse-calc";
import { valorDaTabela, type PrecosProcedimento } from "./atendimento-externo-preco";
import type { ModalidadeConvenio } from "@/lib/convenio/modalidade";

export type RepasseExterno = {
  /** Preço do serviço na tabela desta clínica (base do cálculo). */
  valorTabela: number;
  /** Quanto o médico recebe. */
  repasse: number;
};

export async function calcularRepasseExterno(params: {
  clinicaId: string;
  medicoId: string | null;
  procedimento: string | null;
  modalidade: ModalidadeConvenio | null;
}): Promise<RepasseExterno> {
  const { clinicaId, medicoId, procedimento, modalidade } = params;
  const nome = (procedimento ?? "").trim();
  if (!clinicaId || !nome) return { valorTabela: 0, repasse: 0 };

  const [{ data: proc }, { data: medicoRow }, { data: convRows }, rep] = await Promise.all([
    supabase
      .from("procedimentos")
      .select("nome,tipo,valor_dinheiro,valor_dinheiro_pix,valor_padrao")
      .eq("clinica_id", clinicaId)
      .ilike("nome", nome)
      .limit(1)
      .maybeSingle(),
    medicoId
      ? supabase
          .from("medicos")
          .select("id,aceita_cartao_beneficios,cb_tipo_repasse,cb_valor_repasse,cb_percentual_repasse")
          .eq("id", medicoId)
          .maybeSingle()
      : Promise.resolve({ data: null } as { data: null }),
    medicoId
      ? supabase
          .from("medico_convenios")
          .select(
            "medico_id,nome,tipo_repasse,percentual,valor,convenio_tipo_repasse,convenio_percentual,convenio_valor,cartao_consulta_valor,cartao_desconto_valor",
          )
          .eq("medico_id", medicoId)
          .eq("ativo", true)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.rpc("medicos_repasse_lista", { _clinica_id: clinicaId }),
  ]);

  const valorTabela = valorDaTabela(proc as PrecosProcedimento | null);
  if (!medicoId) return { valorTabela, repasse: 0 };

  const padrao = ((rep?.data as unknown[] | null) ?? []).find(
    (r) => (r as { id?: string }).id === medicoId,
  ) as
    | {
        tipo_repasse?: string | null;
        percentual_repasse_padrao?: number | null;
        valor_repasse_padrao?: number | null;
      }
    | undefined;

  const m = (medicoRow ?? {}) as Record<string, unknown>;
  const medico: RepasseMedico = {
    id: medicoId,
    tipo_repasse: padrao?.tipo_repasse ?? "percentual",
    percentual_repasse_padrao: Number(padrao?.percentual_repasse_padrao ?? 0),
    valor_repasse_padrao: padrao?.valor_repasse_padrao ?? null,
    aceita_cartao_beneficios: !!m.aceita_cartao_beneficios,
    cb_tipo_repasse: (m.cb_tipo_repasse as string) ?? null,
    cb_valor_repasse: (m.cb_valor_repasse as number) ?? null,
    cb_percentual_repasse: (m.cb_percentual_repasse as number) ?? null,
  };

  const procTipos = new Map<string, string>();
  const p = proc as { nome?: string | null; tipo?: string | null } | null;
  if (p?.nome && p.tipo) procTipos.set(normRepasse(p.nome), p.tipo);

  const ctx: RepasseCtx = {
    medicos: [medico],
    convenios: ((convRows ?? []) as RepasseConvenio[]),
    procTipos,
  };

  const { repasse } = calcRepasseFull(ctx, medicoId, valorTabela, nome, null, modalidade);
  return { valorTabela, repasse: Math.max(0, Number(repasse) || 0) };
}

/** Lista os convênios ativos da clínica, para escolher o do paciente. */
export async function listarConveniosClinica(
  clinicaId: string,
): Promise<Array<{ id: string; nome: string; modalidade: ModalidadeConvenio }>> {
  if (!clinicaId) return [];
  const { data } = await supabase
    .from("cb_convenios")
    .select("id,nome,modalidade,ativo")
    .eq("clinica_id", clinicaId)
    .order("nome");
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((c) => c.ativo !== false)
    .map((c) => ({
      id: String(c.id),
      nome: String(c.nome ?? "Convênio"),
      modalidade: (c.modalidade === "cartao_desconto" ? "cartao_desconto" : "cartao_consulta") as ModalidadeConvenio,
    }));
}

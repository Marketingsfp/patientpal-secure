/**
 * Lotes da importação de beneficiários por planilha (Cartão Benefícios /
 * Terapêutico) — base do "Desfazer importação".
 *
 * Cada importação abre um lote no banco e anota nele tudo o que CRIOU
 * (pacientes, contratos, vínculos de dependente). O desfazer apaga só o que
 * está anotado, e só se nada daquilo foi usado depois (agenda, financeiro,
 * prontuário...). A conferência de uso e a permissão (só gestor da unidade)
 * ficam no banco, em `cb_importacao_reverter` — a tela só mostra o resultado.
 *
 * As tabelas não são acessíveis direto pelo navegador: tudo passa pelas
 * funções `cb_importacao_*` (migration 0029).
 */

import { supabase } from "@/integrations/supabase/client";
import type { ProdutoCartao } from "@/lib/cartao/produto";

export type TipoItemLote = "titular" | "dependente" | "contrato" | "vinculo";

export type StatusLote = "em_andamento" | "concluido" | "revertido";

export interface LoteImportacao {
  id: string;
  arquivo_nome: string;
  status: StatusLote;
  created_at: string;
  concluido_em: string | null;
  revertido_em: string | null;
  pendencias: number;
  convenio_nome: string | null;
  criado_por_nome: string | null;
  revertido_por_nome: string | null;
  titulares: number;
  dependentes: number;
  contratos: number;
  vinculos: number;
  /** Quem está vendo é gestor da unidade (único que pode desfazer). */
  pode_desfazer: boolean;
  removidos: {
    titulares: number;
    dependentes: number;
    contratos: number;
    vinculos: number;
  } | null;
}

export interface ResultadoReversao {
  ok: boolean;
  simulado: boolean;
  titulares: number;
  dependentes: number;
  contratos: number;
  vinculos: number;
  /** Quem impede o desfazer: nome e onde já foi usado. */
  bloqueios: { nome: string; onde: string }[];
}

type RespostaRpc = { data: unknown; error: { code?: string; message?: string } | null };

// As funções são novas e ainda não estão no types.ts gerado.
const rpc = supabase.rpc as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<RespostaRpc>;

/** A função ainda não existe no banco (migration 0029 não aplicada). */
export function ehFuncaoAusente(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "42883";
}

export async function iniciarLote(params: {
  clinicaId: string;
  produto: ProdutoCartao;
  convenioId: string;
  arquivoNome: string;
}): Promise<string> {
  const { data, error } = await rpc("cb_importacao_iniciar", {
    _clinica_id: params.clinicaId,
    _produto: params.produto,
    _convenio_id: params.convenioId,
    _arquivo_nome: params.arquivoNome,
  });
  if (error) throw error;
  return data as string;
}

export async function registrarNoLote(
  loteId: string,
  tipo: TipoItemLote,
  ids: string[],
): Promise<void> {
  if (!ids.length) return;
  const { error } = await rpc("cb_importacao_registrar", {
    _lote_id: loteId,
    _tipo: tipo,
    _ids: ids,
  });
  if (error) throw error;
}

export async function concluirLote(loteId: string, pendencias: number): Promise<void> {
  const { error } = await rpc("cb_importacao_concluir", {
    _lote_id: loteId,
    _pendencias: pendencias,
  });
  if (error) throw error;
}

export async function listarLotes(
  clinicaId: string,
  produto: ProdutoCartao,
): Promise<LoteImportacao[]> {
  const { data, error } = await rpc("cb_importacao_listar", {
    _clinica_id: clinicaId,
    _produto: produto,
    _limite: 20,
  });
  if (error) throw error;
  return (data ?? []) as LoteImportacao[];
}

/** `simular: true` só confere e conta; `false` apaga de verdade. */
export async function reverterLote(loteId: string, simular: boolean): Promise<ResultadoReversao> {
  const { data, error } = await rpc("cb_importacao_reverter", {
    _lote_id: loteId,
    _simular: simular,
  });
  if (error) throw error;
  return data as ResultadoReversao;
}

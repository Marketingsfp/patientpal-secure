/**
 * Leitura das tabelas do sistema para montar a base do Coach.
 *
 * Tudo aqui passa pelo cliente normal do navegador: as políticas de acesso já
 * liberam `procedimentos`, `nina_cat_servicos`, `nina_cat_profissionais`,
 * `medicos`, `especialidades` e `unidades` para qualquer pessoa ATIVA da
 * clínica. Nenhuma chave administrativa é usada — a atendente lê exatamente o
 * que ela já poderia ler nas outras telas.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  montarBase,
  type CatProfissionalBase,
  type CatServicoBase,
  type MedicoBase,
  type ProcedimentoBase,
  type UnidadeBase,
} from "./base-conhecimento";

const PAGINA = 1000;
const TETO_PROCEDIMENTOS = 6000;

const COLUNAS_PROC =
  "nome,tipo,grupo,valor_padrao,valor_dinheiro,valor_pix,valor_dinheiro_pix,valor_cartao,valor_cartao_credito,valor_cartao_debito,valor_cartao_consulta,valor_cartao_desconto,preparo,observacoes,duracao_minutos,requer_laudo,requer_medico";

/** Lê os procedimentos ativos em páginas — a MJ passa de 4.600 linhas. */
async function lerProcedimentos(clinicaId: string): Promise<ProcedimentoBase[]> {
  const todos: ProcedimentoBase[] = [];
  for (let inicio = 0; inicio < TETO_PROCEDIMENTOS; inicio += PAGINA) {
    const { data, error } = await supabase
      .from("procedimentos")
      .select(COLUNAS_PROC)
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("grupo", { ascending: true })
      .order("nome", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as unknown as ProcedimentoBase[];
    todos.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return todos;
}

export type BaseGerada = { texto: string; geradoEm: Date; tamanho: number };

/** Monta a base atual da clínica a partir das tabelas do sistema. */
export async function gerarBaseDoSistema(
  clinicaId: string,
  clinicaNome?: string | null,
): Promise<BaseGerada> {
  const [procedimentos, servicos, profissionais, medicos, unidades, clinica] = await Promise.all([
    lerProcedimentos(clinicaId),
    supabase
      .from("nina_cat_servicos")
      .select("nome,valor,valor_observacao,descricao_publica,preparo,restricoes,executantes,formas_pagamento")
      .eq("clinica_id", clinicaId)
      .eq("status", "PUBLICADO")
      .limit(1000),
    supabase
      .from("nina_cat_profissionais")
      .select(
        "nome,especialidades,horarios,tipo_atendimento,convenios,formas_pagamento,observacao_publica,aviso_dia,atende_consultorio",
      )
      .eq("clinica_id", clinicaId)
      .eq("status", "PUBLICADO")
      .limit(500),
    supabase
      .from("medicos")
      .select("nome,especialidades:especialidade_id(nome)")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .order("nome")
      .limit(500),
    supabase
      .from("unidades")
      .select("nome,endereco,cidade,estado,telefone")
      .eq("clinica_id", clinicaId)
      .eq("ativo", true)
      .limit(50),
    supabase.from("clinicas").select("nome,endereco,cidade,estado,telefone").eq("id", clinicaId).maybeSingle(),
  ]);

  const listaUnidades = ((unidades.data ?? []) as unknown as UnidadeBase[]).slice();
  // Clínica sem unidades cadastradas: o endereço e o telefone do cadastro da
  // própria clínica são a melhor informação disponível — e é a situação de
  // hoje nas três clínicas.
  if (!listaUnidades.length && clinica.data) {
    listaUnidades.push(clinica.data as unknown as UnidadeBase);
  }

  const geradoEm = new Date();
  const texto = montarBase({
    clinicaNome: clinicaNome ?? clinica.data?.nome ?? "Clínica",
    geradoEm,
    procedimentos,
    catalogoServicos: (servicos.data ?? []) as unknown as CatServicoBase[],
    catalogoProfissionais: (profissionais.data ?? []) as unknown as CatProfissionalBase[],
    medicos: ((medicos.data ?? []) as unknown as Array<{
      nome: string;
      especialidades: { nome: string } | null;
    }>).map<MedicoBase>((m) => ({ nome: m.nome, especialidade: m.especialidades?.nome ?? null })),
    unidades: listaUnidades,
  });

  return { texto, geradoEm, tamanho: texto.length };
}

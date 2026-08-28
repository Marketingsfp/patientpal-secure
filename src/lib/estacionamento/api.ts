/**
 * Acesso à tabela `estacionamento_movimentos`.
 *
 * O `as unknown as` mora AQUI, num ponto só, e não espalhado pela tela. Os
 * tipos em `integrations/supabase/types.ts` são gerados a partir do schema do
 * banco, e a tabela do estacionamento é nova: enquanto o SQL de
 * `supabase/migrations/20260827200000_estacionamento_movimentos.sql` não for
 * aplicado, ela não existe nos tipos gerados.
 *
 * Quando o SQL for aplicado e os tipos regenerados, apaga-se o bloco
 * `ClienteSemTipos` abaixo e troca-se `cliente()` por `supabase` — nenhuma
 * outra linha do projeto muda, porque ninguém fora deste arquivo fala com a
 * tabela diretamente.
 *
 * Até lá a tela funciona: a consulta devolve erro de tabela inexistente e o
 * módulo aparece vazio, com o aviso de que falta aplicar o SQL.
 */
import { supabase } from "@/integrations/supabase/client";

export type TipoMovimento = "rotativo" | "mensalista";
/** "entrada" = dinheiro recebido; "saida" = despesa do próprio estacionamento. */
export type Sentido = "entrada" | "saida";

/**
 * Como cada tipo aparece na tela.
 *
 * O banco continua gravando "rotativo" e "mensalista" — o CHECK da tabela e os
 * registros já existentes dependem disso, e renomear no banco seria uma
 * migração de dados para trocar uma palavra de tela. A diretoria pediu os
 * nomes "Particular" e "Mensalidade", e é só o rótulo que muda.
 */
export const LABEL_TIPO: Record<TipoMovimento, string> = {
  rotativo: "Particular",
  mensalista: "Mensalidade",
};

/**
 * Quem é a linha: o cliente e o carro, na mesma frase.
 *
 * Quando existem os dois, mostra "JOÃO DA SILVA (ABC1D23)". A recepção procura
 * ora por um, ora por outro — o mensalista se apresenta pelo nome, e o carro na
 * cancela se identifica pela placa. A primeira versão mostrava só o nome quando
 * havia nome, e quem tinha a placa na mão não achava o lançamento na lista.
 *
 * Com só um dos dois, mostra o que existe. Sem nenhum, devolve "—": a linha
 * precisa continuar visível e apagável mesmo tendo sido lançada incompleta.
 */
export function quemEhNoMovimento(m: { nome?: string | null; placa?: string | null }): string {
  const nome = m.nome?.trim() || null;
  const placa = m.placa?.trim() || null;
  if (nome && placa) return `${nome} (${placa})`;
  return nome ?? placa ?? "—";
}

export interface MovimentoEstacionamento {
  id: string;
  clinica_id: string;
  tipo: TipoMovimento;
  sentido: Sentido;
  placa: string | null;
  nome: string | null;
  valor: number;
  forma_pagamento: string | null;
  /** Dia em que o dinheiro entrou (YYYY-MM-DD). */
  data: string;
  /** Mês a que a mensalidade se refere (dia 1). Nulo no rotativo. */
  competencia: string | null;
  observacoes: string | null;
  criado_por: string | null;
  created_at: string;
}

export interface NovoMovimento {
  clinica_id: string;
  tipo: TipoMovimento;
  sentido: Sentido;
  placa: string | null;
  nome: string | null;
  valor: number;
  forma_pagamento: string | null;
  data: string;
  competencia: string | null;
  observacoes: string | null;
  criado_por: string | null;
}

interface RespostaBanco {
  data: unknown;
  error: { message?: string } | null;
}

/** Forma mínima do cliente para a tabela ainda ausente dos tipos gerados. */
interface ClienteSemTipos {
  from: (tabela: string) => {
    select: (colunas: string) => {
      eq: (
        coluna: string,
        valor: string,
      ) => {
        gte: (
          coluna: string,
          valor: string,
        ) => {
          lte: (
            coluna: string,
            valor: string,
          ) => {
            order: (coluna: string, opcoes: { ascending: boolean }) => PromiseLike<RespostaBanco>;
          };
        };
      };
    };
    insert: (linha: NovoMovimento) => PromiseLike<RespostaBanco>;
    delete: () => { eq: (coluna: string, valor: string) => PromiseLike<RespostaBanco> };
  };
}

const cliente = () => supabase as unknown as ClienteSemTipos;

const COLUNAS =
  "id, clinica_id, tipo, sentido, placa, nome, valor, forma_pagamento, data, competencia, observacoes, criado_por, created_at";

/**
 * A tabela ainda não existe no banco? Serve para a tela explicar o que falta
 * em vez de despejar um erro vermelho de banco na cara de quem abriu a aba.
 *
 * O texto do erro muda conforme quem responde. O PostgREST, que é quem atende
 * o app, devolve "Could not find the table 'public.estacionamento_movimentos'
 * in the schema cache" — sem as palavras "does not exist" nem "relation", que
 * é o que o Postgres cru diria. A primeira versão desta função só conhecia a
 * forma do Postgres e deixou passar justamente a mensagem que aparece na
 * prática. Por isso a lista cobre as duas, e o teste guarda as duas.
 */
export function ehTabelaAusente(erro: { message?: string } | null | undefined): boolean {
  const m = erro?.message ?? "";
  if (!/estacionamento_movimentos/i.test(m)) return false;
  return /(does not exist|não existe|nao existe|relation|schema cache|could not find)/i.test(m);
}

/** Movimentos da clínica dentro do intervalo, do mais recente para o mais antigo. */
export async function listarMovimentos(
  clinicaId: string,
  de: string,
  ate: string,
): Promise<{ movimentos: MovimentoEstacionamento[]; erro: { message?: string } | null }> {
  const r = await cliente()
    .from("estacionamento_movimentos")
    .select(COLUNAS)
    .eq("clinica_id", clinicaId)
    .gte("data", de)
    .lte("data", ate)
    .order("created_at", { ascending: false });
  if (r.error) return { movimentos: [], erro: r.error };
  const linhas = (r.data ?? []) as MovimentoEstacionamento[];
  return {
    movimentos: linhas.map((l) => ({ ...l, valor: Number(l.valor) || 0 })),
    erro: null,
  };
}

export async function criarMovimento(
  novo: NovoMovimento,
): Promise<{ erro: { message?: string } | null }> {
  const r = await cliente().from("estacionamento_movimentos").insert(novo);
  return { erro: r.error };
}

export async function excluirMovimento(id: string): Promise<{ erro: { message?: string } | null }> {
  const r = await cliente().from("estacionamento_movimentos").delete().eq("id", id);
  return { erro: r.error };
}

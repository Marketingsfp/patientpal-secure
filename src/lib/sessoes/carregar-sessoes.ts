/**
 * Acesso ao banco do relatório de Sessões e Manutenções.
 *
 * Toda a conta vive na função `fn_relatorio_sessoes` do banco, e não aqui. O
 * motivo é permissão: o relatório é do financeiro e da recepção, mas as
 * tabelas de sessão (`fisio_pacotes` / `fisio_sessoes`) estão fechadas pelo
 * módulo `fisioterapia`, que nenhum dos dois perfis tem. Ler direto pelas
 * tabelas devolveria uma folha vazia, sem erro nenhum — o pior tipo de falha
 * num relatório. A função é SECURITY DEFINER e confere o acesso por
 * `relatorios`, `financeiro` ou `recepcao`.
 *
 * A regra de leitura das linhas (o que é busca ativa, o que é pendência
 * financeira, como cada linha aparece) mora em `./relatorio-sessoes`, que é
 * puro e coberto por teste.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  LinhaSessao,
  ModoSessoes,
  OrigemSessao,
  SituacaoFinanceira,
} from "./relatorio-sessoes";

const num = (v: unknown) => Number(v ?? 0) || 0;
const txt = (v: unknown) => String(v ?? "");
const dia = (v: unknown) => (v ? String(v).slice(0, 10) : null);

/**
 * No modo `posicao`, `_ate` não é só o fim da janela: é a data de referência
 * dos dias parados — para os ciclos de manutenção ela responde "quantos dias
 * este paciente está sem aparecer, olhando desta data". No modo `movimento` o
 * par `_de`/`_ate` é janela de verdade, e só entra o que aconteceu dentro dela.
 */
export async function carregarSessoes(filtros: {
  clinicaId: string;
  de: string;
  ate: string;
  modo?: ModoSessoes;
}): Promise<LinhaSessao[]> {
  const { data, error } = await supabase.rpc("fn_relatorio_sessoes", {
    _clinica_id: filtros.clinicaId,
    _de: filtros.de,
    _ate: filtros.ate,
    _modo: filtros.modo ?? "posicao",
  });
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    origem: (txt(r.origem) === "ciclo" ? "ciclo" : "pacote") as OrigemSessao,
    paciente_id: txt(r.paciente_id),
    paciente_nome: txt(r.paciente_nome),
    prontuario: txt(r.prontuario),
    procedimento: txt(r.procedimento),
    profissional: txt(r.profissional),
    total_sessoes: num(r.total_sessoes),
    realizadas: num(r.realizadas),
    faltas: num(r.faltas),
    restantes: num(r.restantes),
    valor_contratado: num(r.valor_contratado),
    valor_pago: num(r.valor_pago),
    situacao_financeira: txt(r.situacao_financeira) as SituacaoFinanceira,
    ultima_data: dia(r.ultima_data),
    proxima_data: dia(r.proxima_data),
    // `null` aqui não é zero: é "não se aplica" (pacote concluído). Zero
    // significa "tem data marcada, não está parado".
    dias_parado: r.dias_parado === null || r.dias_parado === undefined ? null : num(r.dias_parado),
    pendencia: txt(r.pendencia),
  }));
}

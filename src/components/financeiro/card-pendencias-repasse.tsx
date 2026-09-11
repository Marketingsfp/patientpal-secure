import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { hojeBR } from "@/lib/date-utils";
import {
  agruparPendencias,
  diasDeAtraso,
  janelaDePendencias,
  type LinhaPendente,
  type PendenciasDeRepasse,
} from "@/lib/financeiro/pendencias-repasse";

/** "08/09" — dia e mês bastam num card que só olha a última semana. */
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "segunda-feira" a partir de "2026-09-07". */
const diaDaSemana = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "long",
    timeZone: "UTC",
  });

const VAZIO: PendenciasDeRepasse = { dias: [], totalAtendimentos: 0, diaMaisAntigo: null };

/**
 * Card matinal da tesouraria: repasses de dias anteriores ainda em aberto.
 *
 * Quem paga o repasse na clínica é o Financeiro (Bete, Zenilda, Mayra), e a
 * rotina normal é pagar no dia seguinte ao atendimento. Até aqui não existia
 * nenhuma visão dessa fila: para saber o que ficou para trás era preciso abrir
 * a tela de Atendimentos e trocar a data um dia de cada vez. Este card mostra a
 * fila inteira da última semana logo na abertura do Financeiro, e cada linha
 * leva para o dia já filtrado.
 *
 * O card some sozinho quando não há pendência — um card que vive dizendo "está
 * tudo certo" deixa de ser lido, e aí não avisa quando importa.
 *
 * Ele NÃO mostra quanto será pago de repasse. O valor do médico é calculado
 * pelas regras de cada um na tela de Atendimentos e não fica gravado no
 * atendimento da agenda; repetir a conta aqui só criaria um segundo número
 * para conferir. O que aparece é o valor cobrado dos pacientes, rotulado como
 * tal, para dar noção de tamanho da fila.
 */
export function CardPendenciasRepasse({
  atualizacao = 0,
}: {
  /**
   * Muda quando o Dashboard se atualiza sozinho; o card relê a fila junto,
   * sem sumir da tela enquanto relê.
   */
  atualizacao?: number;
} = {}) {
  const { clinicaAtual } = useClinica();
  const [fila, setFila] = useState<PendenciasDeRepasse>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const hoje = hojeBR();
  const clinicaId = clinicaAtual?.clinica_id;

  // Trocar de clínica ou virar o dia recomeça do zero; a atualização
  // automática só troca a fila quando a leitura nova chega.
  useEffect(() => {
    setCarregando(true);
  }, [clinicaId, hoje]);

  useEffect(() => {
    if (!clinicaAtual) {
      setFila(VAZIO);
      setCarregando(false);
      return;
    }
    let cancelado = false;
    const { de, ate } = janelaDePendencias(hoje);
    void (async () => {
      // Duas origens, as mesmas que a tela de Atendimentos soma: o atendimento
      // que nasceu na agenda (fin_lancamentos com agendamento) e o lançado à
      // mão pelo financeiro (fin_atendimentos).
      const [agenda, manual] = await Promise.all([
        supabase
          .from("fin_lancamentos")
          .select("data, valor, agendamento:agendamentos!inner(medico_id, status)")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("tipo", "receita")
          .eq("status", "confirmado")
          .eq("repasse_pago", false)
          .gte("data", de)
          .lte("data", ate),
        supabase
          .from("fin_atendimentos")
          .select("data, valor_medico, medico_id")
          .eq("clinica_id", clinicaAtual.clinica_id)
          .eq("repasse_pago", false)
          .gte("data", de)
          .lte("data", ate),
      ]);
      if (cancelado) return;
      // Erro aqui não vira toast: é um card informativo abrindo junto com o
      // dashboard inteiro, e um alerta vermelho por causa dele assustaria sem
      // motivo. Some silenciosamente e a tela de Atendimentos segue sendo a
      // fonte de verdade.
      if (agenda.error || manual.error) {
        setFila(VAZIO);
        setCarregando(false);
        return;
      }
      const linhas: LinhaPendente[] = [
        ...(
          (agenda.data ?? []) as Array<{
            data: string;
            valor: number | null;
            agendamento: { medico_id: string | null; status: string | null } | null;
          }>
        )
          // O "realizado" é conferido aqui, e não como filtro no campo
          // aninhado da consulta: filtrar dentro do embed depende de uma
          // sintaxe do PostgREST que não é usada em nenhum outro lugar deste
          // projeto, e se ela falhasse em silêncio o card passaria a cobrar
          // repasse de atendimento que nem aconteceu. A janela é de sete dias,
          // então conferir na memória custa nada.
          .filter((r) => r.agendamento?.status === "realizado")
          .map((r) => ({
            data: r.data,
            valor: r.valor,
            medico_id: r.agendamento?.medico_id ?? null,
          })),
        ...(
          (manual.data ?? []) as Array<{
            data: string;
            valor_medico: number | null;
            medico_id: string | null;
          }>
        ).map((r) => ({ data: r.data, valor: r.valor_medico, medico_id: r.medico_id })),
      ];
      setFila(agruparPendencias(linhas));
      setCarregando(false);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId, hoje, atualizacao]);

  if (carregando || fila.dias.length === 0) return null;

  const atraso = diasDeAtraso(fila.diaMaisAntigo, hoje);

  return (
    <Card className="border-sky-300 bg-sky-50/60">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <CalendarClock className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-[16rem]">
            <p className="font-semibold text-sky-900">Repasse de dias anteriores ainda em aberto</p>
            <p className="text-xs text-sky-900/80 mt-0.5">
              {fila.totalAtendimentos} atendimento{fila.totalAtendimentos === 1 ? "" : "s"} em{" "}
              {fila.dias.length} dia{fila.dias.length === 1 ? "" : "s"} esperando pagamento
              {atraso > 1 ? ` — o mais antigo é de ${atraso} dias atrás` : ""}. Clique num dia para
              abrir a tela de pagamento já filtrada nele.
            </p>
          </div>
        </div>

        <ul className="space-y-1.5">
          {fila.dias.map((d) => (
            <li key={d.dia}>
              <Link
                to="/app/financeiro/atendimentos"
                search={{ de: d.dia, ate: d.dia }}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-sky-200 bg-white px-3 py-2 hover:bg-sky-100/70 transition-colors"
              >
                <span className="font-semibold tabular-nums text-sm">{diaCurto(d.dia)}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {diaDaSemana(d.dia)}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {d.atendimentos} atend.
                </Badge>
                {d.medicos > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {d.medicos} médico{d.medicos === 1 ? "" : "s"}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 text-sky-600 ml-auto shrink-0" />
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Link
            to="/app/financeiro/atendimentos"
            search={{
              de: fila.dias[fila.dias.length - 1].dia,
              ate: fila.dias[0].dia,
            }}
          >
            <Button size="sm" variant="outline" className="border-sky-400 bg-white">
              Ver todos os dias juntos
            </Button>
          </Link>
          <p className="text-[11px] text-muted-foreground">
            A fila olha os 7 dias anteriores. O dia de hoje fica de fora porque o repasse dele ainda
            está sendo gerado.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

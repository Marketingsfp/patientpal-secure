import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDatePura } from "@/lib/date-utils";
import {
  PACOTE_STATUS_LABEL,
  SESSAO_CLASSE,
  SESSAO_LABEL,
  type FisioSessaoStatus,
} from "@/lib/fisio";

/**
 * Grade de sessões do paciente para a RECEPÇÃO e o financeiro.
 *
 * Existe separada do painel de Fisioterapia por causa de permissão. As tabelas
 * `fisio_pacotes` / `fisio_sessoes` são fechadas pelo módulo `fisioterapia`,
 * que nem a recepção nem o caixa têm — quem atende no balcão simplesmente não
 * enxergaria "3 de 5, próxima dia 12", que é justamente o que ela precisa
 * responder ao paciente. Por isso a leitura passa pela função
 * `fn_pacotes_do_paciente`, que devolve só a parte administrativa.
 *
 * Evolução da sessão, dor antes/depois e qualquer anotação clínica NÃO vêm
 * nessa função e não aparecem aqui: quem trata continua vendo isso na aba de
 * Fisioterapia, com o módulo liberado.
 */
interface Props {
  pacienteId: string;
}

interface LinhaRpc {
  pacote_id: string;
  descricao: string;
  status: string;
  total_sessoes: number;
  data_inicio: string;
  valor_total: number;
  valor_pago: number;
  sessao_id: string;
  numero: number;
  sessao_status: string;
  data_prevista: string | null;
  agendamento_id: string | null;
}

interface Pacote {
  id: string;
  descricao: string;
  status: string;
  total_sessoes: number;
  data_inicio: string;
  valor_total: number;
  valor_pago: number;
  sessoes: Array<{
    id: string;
    numero: number;
    status: FisioSessaoStatus;
    data_prevista: string | null;
  }>;
}

const brl = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PacienteSessoesPanel({ pacienteId }: Props) {
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("fn_pacotes_do_paciente", {
      _paciente_id: pacienteId,
    });
    if (error) {
      setLoading(false);
      mostrarErro(error);
      return;
    }
    // A função devolve uma linha por SESSÃO, com os dados do pacote repetidos.
    // Aqui elas voltam a ser um pacote com suas sessões dentro.
    const porPacote = new Map<string, Pacote>();
    for (const r of (data ?? []) as LinhaRpc[]) {
      let p = porPacote.get(r.pacote_id);
      if (!p) {
        p = {
          id: r.pacote_id,
          descricao: r.descricao,
          status: r.status,
          total_sessoes: r.total_sessoes,
          data_inicio: r.data_inicio,
          valor_total: Number(r.valor_total) || 0,
          valor_pago: Number(r.valor_pago) || 0,
          sessoes: [],
        };
        porPacote.set(r.pacote_id, p);
      }
      p.sessoes.push({
        id: r.sessao_id,
        numero: r.numero,
        status: r.sessao_status as FisioSessaoStatus,
        data_prevista: r.data_prevista,
      });
    }
    setPacotes([...porPacote.values()]);
    setLoading(false);
  }, [pacienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (loading) return <p className="text-sm text-muted-foreground">Carregando sessões…</p>;

  if (pacotes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este paciente não tem pacote de sessões. O pacote é aberto sozinho quando um procedimento
        com sessões incluídas (ex.: Fisioterapia 5 sessões) é agendado.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {pacotes.map((p) => (
        <PacoteCard key={p.id} pacote={p} />
      ))}
    </div>
  );
}

function PacoteCard({ pacote }: { pacote: Pacote }) {
  const realizadas = useMemo(
    () => pacote.sessoes.filter((s) => s.status === "realizada").length,
    [pacote.sessoes],
  );
  const faltas = useMemo(
    () => pacote.sessoes.filter((s) => s.status === "faltou").length,
    [pacote.sessoes],
  );
  // Próxima data marcada na agenda. É a resposta que a recepção dá no balcão.
  const proxima = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return pacote.sessoes
      .filter((s) => s.status === "agendada" && s.data_prevista && s.data_prevista >= hoje)
      .map((s) => s.data_prevista as string)
      .sort()[0];
  }, [pacote.sessoes]);
  const aFazer = pacote.sessoes.filter(
    (s) => s.status === "pendente" || s.status === "agendada",
  ).length;
  const falta = Math.max(0, pacote.valor_total - pacote.valor_pago);

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-medium">{pacote.descricao}</p>
            <p className="text-xs text-muted-foreground">
              Início {formatDatePura(pacote.data_inicio)} · {brl(pacote.valor_total)}
              {faltas > 0 && ` · ${faltas} falta(s)`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-mono">
              {realizadas}/{pacote.total_sessoes}
            </span>
            <Badge variant={pacote.status === "ativo" ? "default" : "secondary"}>
              {PACOTE_STATUS_LABEL[pacote.status] ?? pacote.status}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {pacote.sessoes.map((s) => (
            <span
              key={s.id}
              title={`Sessão ${s.numero} — ${SESSAO_LABEL[s.status] ?? s.status}${
                s.data_prevista ? ` · ${formatDatePura(s.data_prevista)}` : ""
              }`}
              className={`h-9 w-9 rounded-md border-2 text-xs font-mono flex items-center justify-center ${
                SESSAO_CLASSE[s.status] ?? SESSAO_CLASSE.pendente
              }`}
            >
              {s.numero}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {/* Situação financeira: só aparece quando ainda falta receber, para
              não poluir a ficha do paciente que já pagou tudo — que é o caso
              normal, já que o pacote é vendido pago. */}
          {falta > 0.004 ? (
            <span className="text-rose-700 font-medium">
              Falta receber {brl(falta)} (recebido {brl(pacote.valor_pago)})
            </span>
          ) : (
            <span className="text-emerald-700 font-medium">Pago integral</span>
          )}
          {pacote.status === "ativo" &&
            (proxima ? (
              <span className="text-muted-foreground flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                Próxima em {formatDatePura(proxima)}
              </span>
            ) : (
              aFazer > 0 && (
                <span className="text-amber-700 font-medium flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {aFazer} sessão(ões) sem agendamento — marcar na Agenda
                </span>
              )
            ))}
        </div>

        {/* Marcar a próxima sessão é o fluxo normal da agenda: basta escolher o
            mesmo procedimento. O sistema amarra o novo agendamento à próxima
            sessão pendente sozinho, sem abrir pacote repetido. */}
        {pacote.status === "ativo" && aFazer > 0 && !proxima && (
          <Button asChild size="sm" variant="outline">
            <Link to="/app/agenda">
              <ExternalLink className="h-4 w-4 mr-2" /> Marcar próxima sessão na Agenda
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

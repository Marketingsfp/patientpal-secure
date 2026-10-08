// Aviso discreto da seção de médicos do Dashboard: agendamentos dos últimos
// dias que ficaram sem desfecho (paciente não passou pelo balcão). Eles já
// contam como falta nos cards; o aviso serve para a supervisão orientar o
// balcão a dar o desfecho certo no dia a dia. Regra em `sem-desfecho.ts`.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dataClinicaDe, formatDatePura, janelaDiaClinica } from "@/lib/date-utils";
import {
  DIAS_AVISO_SEM_DESFECHO,
  ficouSemDesfecho,
  ultimoDiaEncerrado,
} from "@/lib/painel/sem-desfecho";

type Ficha = {
  id: string;
  inicio: string | null;
  status: string;
  fluxo_etapa: string | null;
  paciente_nome: string | null;
  paciente_id: string | null;
  medico_id: string | null;
};

const PAGINA = 1000;

const addDays = (iso: string, d: number) => {
  const [y, m, dd] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10);
};

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--";

export function AvisoSemDesfecho({
  clinicaIds,
  medicoNome,
}: {
  clinicaIds: string[];
  medicoNome: Map<string, string>;
}) {
  const [aberto, setAberto] = useState(false);
  // Muda às 19h (a clínica fechou) e à meia-noite; a busca acompanha pela chave.
  const ate = ultimoDiaEncerrado();
  const desde = addDays(ate, -(DIAS_AVISO_SEM_DESFECHO - 1));

  // A chave começa com "dashboard-operacional": Atualizar e o tempo real refazem.
  const q = useQuery({
    queryKey: ["dashboard-operacional", "sem-desfecho", clinicaIds.join("|"), ate],
    enabled: clinicaIds.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const ini = janelaDiaClinica(desde).inicio;
      const fim = janelaDiaClinica(ate).fimExclusivo;
      const linhas: Ficha[] = [];
      for (let de = 0; ; de += PAGINA) {
        const { data, error } = await supabase
          .from("agendamentos")
          .select("id,inicio,status,fluxo_etapa,paciente_nome,paciente_id,medico_id")
          .in("clinica_id", clinicaIds)
          .gte("inicio", ini)
          .lt("inicio", fim)
          .in("status", ["agendado", "confirmado"])
          .or("fluxo_etapa.is.null,fluxo_etapa.eq.aguardando_recepcao")
          .not("medico_id", "is", null)
          .order("inicio")
          .order("id")
          .range(de, de + PAGINA - 1);
        if (error) throw error;
        linhas.push(...((data ?? []) as Ficha[]));
        if ((data ?? []).length < PAGINA) break;
      }
      return linhas.filter((a) => ficouSemDesfecho(a, ate));
    },
  });

  const porDia = useMemo(() => {
    const mapa = new Map<string, Ficha[]>();
    for (const f of q.data ?? []) {
      const dia = dataClinicaDe(f.inicio) ?? "";
      mapa.set(dia, [...(mapa.get(dia) ?? []), f]);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [q.data]);

  const qtd = q.data?.length ?? 0;
  if (qtd === 0) return null;

  return (
    <div className="mx-4 mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-left hover:text-slate-800 dark:hover:text-slate-200"
      >
        <strong className="tabular-nums">{qtd.toLocaleString("pt-BR")}</strong>{" "}
        {qtd === 1 ? "agendamento" : "agendamentos"} dos últimos {DIAS_AVISO_SEM_DESFECHO} dias{" "}
        {qtd === 1 ? "ficou" : "ficaram"} sem desfecho — o paciente não passou pelo balcão e{" "}
        {qtd === 1 ? "está contado" : "estão contados"} como falta.{" "}
        <span className="underline underline-offset-2">Ver lista</span>
      </button>
      <details className="mt-1">
        <summary className="cursor-pointer select-none text-slate-500">
          Por que isso aparece?
        </summary>
        <p className="mt-1 leading-relaxed">
          Quando a clínica fecha (19h) e o agendamento continua "agendado" ou "confirmado", sem
          check-in, o Dashboard conta como falta, mesmo que esteja pago. Nada é alterado na agenda,
          no caixa ou no repasse. Para o número ficar certo nos relatórios, a recepção deve dar o
          desfecho no próprio dia: check-in quando o paciente chega, "Faltou" quando não vem, ou
          cancelar ou reagendar.
        </p>
      </details>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Agendamentos sem desfecho</DialogTitle>
            <DialogDescription>
              {qtd.toLocaleString("pt-BR")} de {formatDatePura(desde)} a {formatDatePura(ate)} —
              paciente não passou pelo balcão
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto min-h-0 flex-1 space-y-3">
            {porDia.map(([dia, fichas]) => (
              <div key={dia}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  {formatDatePura(dia)} · {fichas.length}
                </div>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {fichas.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400 w-11 shrink-0">
                        {hhmm(f.inicio)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {f.paciente_nome ?? "Paciente"}
                        </div>
                        <div className="text-[12px] text-slate-500 truncate">
                          {(f.medico_id && medicoNome.get(f.medico_id)) || "—"}
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-500 shrink-0">
                        {f.status === "confirmado" ? "Confirmado" : "Agendado"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

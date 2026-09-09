// Barra "Resumo do Dia" da Agenda.
//
// Nasceu de um pedido da supervisão: para saber quantas fichas do dia foram
// atendidas, quantas faltaram e quantos encaixes entraram, alguém tinha de
// sair da Agenda e abrir Financeiro → Relatórios. Agora a volumetria fica na
// própria tela, respeitando a DATA e o PROFISSIONAL escolhidos ali em cima.
//
// Por que a barra busca os próprios dados, em vez de contar a lista da tela:
// a lista já chega filtrada por situação, por nome de paciente e pelo botão
// "mostrar horários livres". Contar aquilo devolveria "0 atendidos" só porque
// a recepção filtrou por "confirmado". Aqui a consulta é sempre o DIA INTEIRO
// do profissional escolhido — a conta não muda quando a recepção mexe nos
// outros filtros, e é isso que a supervisão espera de um resumo.
//
// A tela de Agendas é propositalmente "seca" (sem transição nem fade): a
// recepção precisa de resposta instantânea no balcão.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resumirDia, type LinhaResumo } from "@/lib/agenda/resumo-do-dia";
import { RefreshCw, X } from "lucide-react";

type Props = {
  clinicaId: string;
  /** Data selecionada na tela, em AAAA-MM-DD. */
  dataRef: string;
  /** `medico_id` escolhido no filtro, ou "todos". */
  filtroMedico: string;
  /** Nome do profissional filtrado, para o cabeçalho da barra. */
  medicoNome?: string | null;
  onFechar: () => void;
};

/** Um contador da barra. */
function Contador({
  rotulo,
  valor,
  cor,
  titulo,
}: {
  rotulo: string;
  valor: number;
  cor: string;
  titulo: string;
}) {
  return (
    <div title={titulo} className={`min-w-[92px] flex-1 rounded-lg border px-2.5 py-1.5 ${cor}`}>
      <div className="text-[11px] font-semibold uppercase leading-tight opacity-80">{rotulo}</div>
      <div className="text-xl font-bold leading-tight tabular-nums">{valor}</div>
    </div>
  );
}

export function ResumoDoDiaBar({ clinicaId, dataRef, filtroMedico, medicoNome, onFechar }: Props) {
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["agenda-resumo-dia", clinicaId, dataRef, filtroMedico],
    // O balcão muda situação o tempo todo; 30s evita reconsultar a cada clique
    // na tela sem deixar número velho na cara do supervisor.
    staleTime: 30_000,
    queryFn: async (): Promise<LinhaResumo[]> => {
      const inicio = new Date(`${dataRef}T00:00:00`).toISOString();
      const fim = new Date(`${dataRef}T23:59:59`).toISOString();
      let q = supabase
        .from("agendamentos")
        .select("id,inicio,status,paciente_nome,paciente_id,medico_id,agenda_id")
        .eq("clinica_id", clinicaId)
        .gte("inicio", inicio)
        .lte("inicio", fim);
      if (filtroMedico !== "todos") q = q.eq("medico_id", filtroMedico);
      const { data, error } = await q.range(0, 9999);
      if (error) throw error;
      return (data ?? []) as unknown as LinhaResumo[];
    },
  });

  const r = data ? resumirDia(data) : null;
  const dataLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${dataRef}T00:00:00Z`));
  const quem = filtroMedico === "todos" ? "Todos os profissionais" : (medicoNome ?? "Profissional");

  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-xs">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-[13px]">
          <span className="font-semibold text-slate-900">Resumo do dia</span>
          <span className="mx-1.5 text-slate-300">·</span>
          <span className="text-slate-600">{dataLabel}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          <span className="text-slate-600">{quem}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void refetch()}
            title="Atualizar os números"
            aria-label="Atualizar os números"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onFechar}
            title="Fechar o resumo"
            aria-label="Fechar o resumo"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          Não foi possível carregar o resumo agora. Clique em atualizar para tentar de novo.
        </div>
      ) : !r ? (
        <div className="px-1 py-2 text-[13px] text-slate-500">Somando as fichas do dia…</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Contador
              rotulo="Fichas geradas"
              valor={r.fichasGeradas}
              cor="border-slate-200 bg-slate-50 text-slate-800"
              titulo="Todos os horários da grade neste dia, ocupados ou não."
            />
            <Contador
              rotulo="Livres"
              valor={r.livres}
              cor="border-slate-200 bg-white text-slate-700"
              titulo="Horários da grade ainda sem paciente."
            />
            <Contador
              rotulo="Agendados"
              valor={r.agendados}
              cor="border-indigo-200 bg-indigo-50 text-indigo-800"
              titulo="Fichas com paciente marcado, em qualquer situação (inclui cancelados e faltas)."
            />
            <Contador
              rotulo="Aguardando"
              valor={r.aguardando}
              cor="border-slate-200 bg-slate-50 text-slate-700"
              titulo="Marcados que ainda não tiveram a chegada registrada na recepção."
            />
            <Contador
              rotulo="Presentes"
              valor={r.confirmados}
              cor="border-blue-200 bg-blue-50 text-blue-800"
              titulo="Confirmados na clínica — a recepção registrou a chegada."
            />
            <Contador
              rotulo="Em atendimento"
              valor={r.emAtendimento}
              cor="border-amber-200 bg-amber-50 text-amber-800"
              titulo="Pacientes que já entraram na sala."
            />
            <Contador
              rotulo="Atendidos"
              valor={r.atendidos}
              cor="border-emerald-200 bg-emerald-50 text-emerald-800"
              titulo="Atendimentos concluídos (situação Realizado)."
            />
            <Contador
              rotulo="Cancelados"
              valor={r.cancelados}
              cor="border-rose-200 bg-rose-50 text-rose-800"
              titulo="Fichas canceladas neste dia."
            />
            <Contador
              rotulo="Faltas"
              valor={r.faltas}
              cor="border-rose-200 bg-rose-50 text-rose-800"
              titulo="Pacientes marcados que não compareceram."
            />
            <Contador
              rotulo="Encaixes"
              valor={r.encaixes}
              cor="border-violet-200 bg-violet-50 text-violet-800"
              titulo="Pacientes lançados por cima de um horário já ocupado, dividindo a mesma ficha. Nas agendas por ordem de chegada o encaixe entra no fim da fila e não é contado aqui."
            />
          </div>
          <div className="mt-2 text-[11px] leading-snug text-slate-500">
            Conta o dia inteiro do profissional escolhido — não muda com os filtros de situação,
            paciente ou ficha. Agendados inclui cancelados e faltas, porque a grade foi ocupada.
            {isFetching ? " · Atualizando…" : ""}
          </div>
        </>
      )}
    </div>
  );
}

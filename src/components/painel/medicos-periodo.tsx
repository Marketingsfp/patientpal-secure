import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DateInputBR } from "@/components/ui/date-input-br";
import { Button } from "@/components/ui/button";
import { hojeBR } from "@/lib/date-utils";

/** Período da seção de médicos do Dashboard (datas puras YYYY-MM-DD). */
export type PeriodoMedicos = { de: string; ate: string };

/** Soma dias a uma data pura, em calendário — sem passar pelo fuso do navegador. */
const addDays = (iso: string, d: number) => {
  const [y, m, dd] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10);
};
const primeiroDiaDoMes = (iso: string) => `${iso.slice(0, 7)}-01`;

const ATALHOS: { label: string; make: () => PeriodoMedicos }[] = [
  { label: "Hoje", make: () => ({ de: hojeBR(), ate: hojeBR() }) },
  {
    label: "Ontem",
    make: () => ({ de: addDays(hojeBR(), -1), ate: addDays(hojeBR(), -1) }),
  },
  { label: "Este mês", make: () => ({ de: primeiroDiaDoMes(hojeBR()), ate: hojeBR() }) },
  {
    label: "Mês passado",
    make: () => {
      const fimMesPassado = addDays(primeiroDiaDoMes(hojeBR()), -1);
      return { de: primeiroDiaDoMes(fimMesPassado), ate: fimMesPassado };
    },
  },
];

export const periodoHoje = (): PeriodoMedicos => ATALHOS[0].make();
export const ehPeriodoHoje = (p: PeriodoMedicos) => p.de === hojeBR() && p.ate === hojeBR();

export function SeletorPeriodoMedicos({
  periodo,
  onChange,
}: {
  periodo: PeriodoMedicos;
  onChange: (p: PeriodoMedicos) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ATALHOS.map((a) => {
        const alvo = a.make();
        const ativo = alvo.de === periodo.de && alvo.ate === periodo.ate;
        return (
          <Button
            key={a.label}
            type="button"
            size="sm"
            variant={ativo ? "default" : "outline"}
            className="h-8 px-2.5 text-xs"
            onClick={() => onChange(alvo)}
          >
            {a.label}
          </Button>
        );
      })}
      {/* O DateInputBR ocupa a largura toda do pai e ancora o calendário à
          direita dele — a caixa de largura fixa mantém o ícone colado ao campo. */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500">De</span>
        <div className="w-36 shrink-0">
          <DateInputBR
            value={periodo.de}
            onChange={(e) => e.target.value && onChange({ ...periodo, de: e.target.value })}
            className="h-8 text-xs"
            aria-label="Data inicial"
          />
        </div>
        <span className="text-xs text-slate-500">até</span>
        <div className="w-36 shrink-0">
          <DateInputBR
            value={periodo.ate}
            onChange={(e) => e.target.value && onChange({ ...periodo, ate: e.target.value })}
            className="h-8 text-xs"
            aria-label="Data final"
          />
        </div>
      </div>
    </div>
  );
}

export type ContagemMedicoPeriodo = {
  medico_id: string;
  total: number;
  atendidos: number;
  faltas: number;
  pagos: number;
  novos: number;
};

/**
 * Contagem por médico de um período que não seja só hoje. A conta vem pronta do
 * banco (`painel_medicos_periodo`), porque um mês passa de 35 mil agendamentos.
 * A chave começa com "dashboard-operacional", então o botão Atualizar e a
 * atualização em tempo real do Dashboard também refazem esta busca.
 */
export function useMedicosPeriodo(ids: string[], periodo: PeriodoMedicos, enabled: boolean) {
  return useQuery({
    queryKey: ["dashboard-operacional", "medicos-periodo", ids.join("|"), periodo.de, periodo.ate],
    enabled: enabled && ids.length > 0 && periodo.de <= periodo.ate,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "painel_medicos_periodo" as never,
        {
          p_clinicas: ids,
          p_de: periodo.de,
          p_ate: periodo.ate,
        } as never,
      );
      if (error) throw error;
      return ((data ?? []) as ContagemMedicoPeriodo[]).map((r) => ({
        medico_id: r.medico_id,
        total: Number(r.total),
        atendidos: Number(r.atendidos),
        faltas: Number(r.faltas),
        pagos: Number(r.pagos),
        novos: Number(r.novos),
      }));
    },
  });
}

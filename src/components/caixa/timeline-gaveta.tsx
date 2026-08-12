import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

const fmt = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface MovGaveta {
  id: string;
  tipo: "sangria" | "suprimento";
  valor: number;
  descricao: string | null;
  created_at: string;
}

export interface TimelineGavetaProps {
  movimentos: MovGaveta[];
  onNovaSangria?: () => void;
  onNovoSuprimento?: () => void;
}

/** Linha do tempo compacta das entradas e retiradas de dinheiro do turno. */
export function TimelineGaveta({ movimentos, onNovaSangria, onNovoSuprimento }: TimelineGavetaProps) {
  const totalSup = movimentos.filter((m) => m.tipo === "suprimento").reduce((a, m) => a + Number(m.valor || 0), 0);
  const totalSang = movimentos.filter((m) => m.tipo === "sangria").reduce((a, m) => a + Number(m.valor || 0), 0);

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200/70">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Sangrias e suprimentos do turno
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tabular-nums">
          <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700">Suprimentos {fmt(totalSup)}</span>
          <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700">Sangrias {fmt(totalSang)}</span>
        </div>
      </div>
      {movimentos.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-slate-400 space-y-3">
          <p>Nenhuma retirada ou aporte de dinheiro registrado neste turno.</p>
          {(onNovaSangria || onNovoSuprimento) && (
            <div className="flex items-center justify-center gap-2">
              {onNovoSuprimento && (
                <button type="button" onClick={onNovoSuprimento} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" /> Novo suprimento
                </button>
              )}
              {onNovaSangria && (
                <button type="button" onClick={onNovaSangria} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <ArrowUpFromLine className="h-3.5 w-3.5 text-rose-600" /> Nova sangria
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 max-h-64 overflow-auto">
          {movimentos.map((m) => {
            const sup = m.tipo === "suprimento";
            const hora = new Date(m.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${sup ? "bg-emerald-50" : "bg-amber-50"}`}>
                  {sup
                    ? <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />
                    : <ArrowUpFromLine className="h-3.5 w-3.5 text-amber-600" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800">{sup ? "Suprimento" : "Sangria"}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {hora}{m.descricao ? ` · ${m.descricao}` : ""}
                  </div>
                </div>
                <div className={`text-sm font-bold tabular-nums ${sup ? "text-emerald-700" : "text-amber-700"}`}>
                  {sup ? "+" : "−"} {fmt(m.valor)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
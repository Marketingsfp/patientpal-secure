import { useState } from "react";
import { ChevronDown, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const LINHAS = [
  { criterio: "Glicemia de jejum (mg/dL)", normal: "< 100", pre: "100-125", dm: "≥ 126" },
  { criterio: "Glicemia ao acaso (mg/dL) + sintomas", normal: "—", pre: "—", dm: "≥ 200" },
  { criterio: "TTGO - 1 hora (mg/dL)", normal: "< 155", pre: "155-208", dm: "≥ 209" },
  { criterio: "TTGO - 2 horas (mg/dL)", normal: "< 140", pre: "140-199", dm: "≥ 200" },
  { criterio: "HbA1c (%)", normal: "< 5,7", pre: "5,7-6,4", dm: "≥ 6,5" },
];

export function CriteriosSbd2025() {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-slate-100 text-slate-600 border border-slate-200">
            <BookOpen className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-800">
              Critérios laboratoriais: normal, pré-diabetes e diabetes (Diretriz SBD 2025)
            </span>
            <span className="block text-xs text-slate-500">
              Referência rápida para o atendimento.
            </span>
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-500 shrink-0 transition-transform",
            aberto && "rotate-180",
          )}
        />
      </button>

      {aberto && (
        <div className="px-5 pb-5 space-y-3">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="text-left font-semibold px-4 py-2.5 border-b border-slate-200">
                    Critério
                  </th>
                  <th className="text-center font-semibold px-4 py-2.5 border-b border-slate-200">
                    Normal
                  </th>
                  <th className="text-center font-semibold px-4 py-2.5 border-b border-slate-200 bg-yellow-50">
                    Pré-diabetes
                  </th>
                  <th className="text-center font-semibold px-4 py-2.5 border-b border-slate-200 bg-red-50">
                    Diabetes
                  </th>
                </tr>
              </thead>
              <tbody>
                {LINHAS.map((l) => (
                  <tr key={l.criterio} className="border-b border-slate-200 last:border-0">
                    <td className="px-4 py-2.5 text-slate-700">{l.criterio}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-slate-700">
                      {l.normal}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-slate-800 bg-yellow-50">
                      {l.pre}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums font-medium text-slate-800 bg-red-50">
                      {l.dm}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-500">
            Nota: se apenas um exame estiver alterado, o resultado deve ser repetido para
            confirmação diagnóstica. TTGO: teste de tolerância à glicose oral (sobrecarga de 75g).
          </p>
        </div>
      )}
    </div>
  );
}

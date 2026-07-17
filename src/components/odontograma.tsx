import { useMemo } from "react";
import type { OdontoStatus } from "@/lib/odonto";
import { STATUS_COR } from "@/lib/odonto";

// FDI: arcada superior 18..11 | 21..28 ; arcada inferior 48..41 | 31..38
const SUP_DIR = [18,17,16,15,14,13,12,11];
const SUP_ESQ = [21,22,23,24,25,26,27,28];
const INF_ESQ = [31,32,33,34,35,36,37,38];
const INF_DIR = [48,47,46,45,44,43,42,41];

export interface DenteEstado {
  dente: number;
  status: OdontoStatus;
}

interface Props {
  estados: Record<number, OdontoStatus>;
  onClickDente: (dente: number) => void;
  selecionado?: number | null;
  /** Conjunto de dentes com item de orçamento em aberto (recebe anel destacado). */
  orcadoSet?: Set<number>;
}

export function Odontograma({ estados, onClickDente, selecionado, orcadoSet }: Props) {
  const linhas = useMemo(() => [[...SUP_DIR, ...SUP_ESQ], [...INF_DIR, ...INF_ESQ]], []);
  return (
    <div className="flex flex-col gap-3 select-none">
      {linhas.map((linha, idx) => (
        <div key={idx} className="flex justify-center gap-1 flex-wrap">
          {linha.map((d) => {
            const status = estados[d] ?? "higido";
            const cor = STATUS_COR[status];
            const ativo = selecionado === d;
            const orcado = orcadoSet?.has(d) ?? false;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onClickDente(d)}
                className={`relative flex flex-col items-center justify-end h-14 w-9 rounded-md border-2 transition ${ativo ? "border-primary ring-2 ring-primary/30" : orcado ? "border-amber-500 ring-2 ring-amber-400/40" : "border-border hover:border-primary/50"}`}
                style={{ background: `linear-gradient(to top, ${cor} 60%, transparent 60%)` }}
                title={`Dente ${d} — ${status}${orcado ? " · orçado" : ""}`}
              >
                <span className="absolute top-0.5 text-[10px] font-mono text-foreground/70">{d}</span>
                {orcado && (
                  <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      ))}
      <Legenda />
    </div>
  );
}

function Legenda() {
  const items: { label: string; status: OdontoStatus }[] = [
    { label: "Hígido", status: "higido" },
    { label: "Cariado", status: "cariado" },
    { label: "Restaurado", status: "restaurado" },
    { label: "Ausente", status: "ausente" },
    { label: "Extração", status: "extracao_indicada" },
    { label: "Canal", status: "tratamento_canal" },
    { label: "Coroa", status: "coroa" },
    { label: "Implante", status: "implante" },
    { label: "Prótese", status: "protese" },
    { label: "Fratura", status: "fratura" },
  ];
  return (
    <div className="flex flex-wrap gap-3 mt-3 text-xs">
      {items.map((i) => (
        <div key={i.status} className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border border-border" style={{ background: STATUS_COR[i.status] }} />
          <span className="text-muted-foreground">{i.label}</span>
        </div>
      ))}
    </div>
  );
}
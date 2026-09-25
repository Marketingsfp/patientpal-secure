import { useState } from "react";
import { ArrowDown, ArrowRight, CornerDownRight } from "lucide-react";
import {
  ETAPAS_VISAO_SIMPLES,
  NOTA_HOMOLOGACAO_VISAO_SIMPLES,
  SAIDAS_VISAO_SIMPLES,
  type EtapaVisaoSimples,
  type SaidaVisaoSimples,
} from "@/lib/nina/arquitetura/visao-simples";

const ESTILO = {
  paciente: "border-border bg-muted/40",
  nina: "border-primary/40 bg-primary/5",
  saida: "border-amber-500/50 bg-amber-500/5",
} as const;

function Cartao({
  item,
  estilo,
  aberta,
  alternar,
}: {
  item: EtapaVisaoSimples | SaidaVisaoSimples;
  estilo: keyof typeof ESTILO;
  aberta: boolean;
  alternar: () => void;
}) {
  const idDetalhe = `visao-simples-${item.id}`;
  return (
    <div className={`rounded-lg border ${ESTILO[estilo]}`}>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberta}
        aria-controls={idDetalhe}
        className="w-full rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="font-medium">{item.titulo}</p>
        <p className="text-sm text-muted-foreground">{item.resumo}</p>
      </button>
      {aberta && (
        <ul id={idDetalhe} className="list-disc space-y-1 px-3 pb-3 pl-7 text-sm">
          {item.explicacao.map((linha) => (
            <li key={linha}>{linha}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Resumo do atendimento para quem não é técnico. O mapa técnico fica abaixo. */
export function VisaoSimplesNina() {
  const [aberta, setAberta] = useState<string | null>(null);
  const alternar = (id: string) => setAberta((atual) => (atual === id ? null : id));

  return (
    <section aria-label="Como a Nina atende" className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h2 className="font-semibold">Como a Nina atende</h2>
        <p className="text-sm text-muted-foreground">
          Resumo em linguagem simples. Toque em uma etapa para ver o que acontece nela.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-[3px] border border-border bg-muted/40" />
          Paciente
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-[3px] border border-primary/40 bg-primary/5" />
          Caminho da Nina
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-[3px] border border-amber-500/50 bg-amber-500/5" />
          Quando o atendimento sai da Nina
        </span>
      </div>

      <ol className="space-y-1">
        {ETAPAS_VISAO_SIMPLES.map((etapa, indice) => {
          const saidas = SAIDAS_VISAO_SIMPLES.filter((s) => s.depoisDe === etapa.id);
          const ultima = indice === ETAPAS_VISAO_SIMPLES.length - 1;
          return (
            <li key={etapa.id} className="space-y-1">
              <div className="grid items-start gap-2 md:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)]">
                <Cartao
                  item={etapa}
                  estilo={etapa.tipo}
                  aberta={aberta === etapa.id}
                  alternar={() => alternar(etapa.id)}
                />
                {saidas.length > 0 && (
                  <>
                    <ArrowRight
                      aria-hidden
                      className="mt-5 hidden h-4 w-4 text-amber-600 dark:text-amber-400 md:block"
                    />
                    <div className="flex gap-2 pl-3 md:pl-0">
                      <CornerDownRight
                        aria-hidden
                        className="mt-4 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 md:hidden"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        {saidas.map((saida) => (
                          <Cartao
                            key={saida.id}
                            item={saida}
                            estilo="saida"
                            aberta={aberta === saida.id}
                            alternar={() => alternar(saida.id)}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {!ultima && (
                <div className="md:grid md:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)]">
                  <ArrowDown aria-hidden className="mx-auto h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <p className="border-t pt-3 text-xs text-muted-foreground">{NOTA_HOMOLOGACAO_VISAO_SIMPLES}</p>
    </section>
  );
}

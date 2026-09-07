/**
 * Indicador de confiança nas mensagens da Nina (Inbox interna).
 *
 * REGRA DURA: o percentual NÃO é calculado aqui. Ele é lido do que o
 * Confidence Decision Engine gravou no instante em que aquela resposta foi
 * produzida, casado pela execução que gerou a mensagem. Sem registro, o
 * indicador simplesmente não aparece — nunca estimamos um valor.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  confiabilidadeDaExecucao,
  confiancaDasExecucoes,
  type ConfiancaDaMensagem,
  type ConfiabilidadeDecisaoView,
} from "@/lib/nina/confianca.functions";

export type MapaConfianca = Record<string, ConfiancaDaMensagem>;

/** Busca em lote a confiança das execuções presentes na conversa aberta. */
export function useConfiancaMensagens(
  clinicaId: string | null | undefined,
  execucaoIds: string[],
): MapaConfianca {
  const buscar = useServerFn(confiancaDasExecucoes);
  const [mapa, setMapa] = useState<MapaConfianca>({});
  const chave = execucaoIds.slice().sort().join(",");

  useEffect(() => {
    const ids = chave ? chave.split(",") : [];
    if (!clinicaId || ids.length === 0) {
      setMapa({});
      return;
    }
    let ativo = true;
    void (async () => {
      try {
        const linhas = await buscar({ data: { clinicaId, execucaoIds: ids.slice(0, 300) } });
        if (!ativo) return;
        const m: MapaConfianca = {};
        for (const l of linhas) m[l.execucao_id] = l;
        setMapa(m);
      } catch {
        // Indicador auxiliar: falha aqui não pode atrapalhar o atendimento.
        if (ativo) setMapa({});
      }
    })();
    return () => {
      ativo = false;
    };
  }, [buscar, chave, clinicaId]);

  return mapa;
}

const ESTILO: Record<
  string,
  { classe: string; ponto: string; curto: string; rotulo: string; Icone: typeof ShieldCheck }
> = {
  HIGH: {
    classe: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    ponto: "bg-emerald-500",
    curto: "Alta",
    rotulo: "Confiança alta",
    Icone: ShieldCheck,
  },
  MEDIUM: {
    classe: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    ponto: "bg-amber-500",
    curto: "Média",
    rotulo: "Confiança intermediária",
    Icone: ShieldQuestion,
  },
  LOW: {
    classe: "border-destructive/30 bg-destructive/10 text-destructive",
    ponto: "bg-destructive",
    curto: "Baixa",
    rotulo: "Confiança baixa",
    Icone: ShieldAlert,
  },
};

export function ConfiancaMensagemBadge({
  clinicaId,
  confianca,
}: {
  clinicaId: string;
  confianca: ConfiancaDaMensagem;
}) {
  const detalhar = useServerFn(confiabilidadeDaExecucao);
  const [detalhe, setDetalhe] = useState<ConfiabilidadeDecisaoView | null>(null);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDetalhe(await detalhar({ data: { clinicaId, execucaoId: confianca.execucao_id } }));
    } catch {
      setDetalhe(null);
    }
  }, [clinicaId, confianca.execucao_id, detalhar]);

  useEffect(() => {
    if (aberto && !detalhe) void carregar();
  }, [aberto, carregar, detalhe]);

  const estilo = ESTILO[confianca.nivel] ?? ESTILO["LOW"]!;
  const { Icone } = estilo;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${estilo.rotulo}: ${confianca.score}%. Ver detalhes.`}
          title={`${estilo.rotulo} — ${confianca.score}% (visível apenas para a equipe)`}
          className={`inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium leading-none ${estilo.classe}`}
        >
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${estilo.ponto}`} />
          {confianca.score}% {estilo.curto}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 text-xs">
        <div>
          <p className="text-sm font-medium">
            <Icone className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            {estilo.rotulo} — {confianca.score}%
          </p>
          <p className="text-muted-foreground">
            Registrado quando a resposta foi produzida. Não é recalculado.
          </p>
          <p className="text-muted-foreground">
            Política de confiança: {confianca.policy_version ?? "desconhecida"}
          </p>
        </div>
        {confianca.bloqueadores.length > 0 && (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
            <p className="font-medium">Bloqueio objetivo</p>
            <ul className="list-disc pl-4">
              {confianca.bloqueadores.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
        {detalhe ? (
          <>
            <p className="text-muted-foreground">Resultado: {detalhe.resultado}</p>
            <ul className="space-y-1">
              {detalhe.linhas.map((l, i) => (
                <li key={`${l.rotulo}-${i}`} className="flex items-start gap-1">
                  <span aria-hidden>{l.ok ? "✓" : "✕"}</span>
                  <span className={l.ok ? "" : "text-destructive"}>
                    {l.rotulo}
                    {l.detalhe ? ` — ${l.detalhe}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted-foreground">Carregando detalhes…</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Mensagem da Nina anterior ao registro de confiança (ou sem avaliação
 * gravada). Nunca inventamos pontuação: dizemos que não foi avaliada.
 */
export function ConfiancaNaoAvaliadaBadge() {
  return (
    <span
      title="Esta resposta é anterior ao registro de confiança ou não teve avaliação gravada (visível apenas para a equipe)."
      className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border border-border/60 px-1.5 text-[10px] font-medium leading-none text-muted-foreground"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-muted-foreground/60" />
      Não avaliada
    </span>
  );
}

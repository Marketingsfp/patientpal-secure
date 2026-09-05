/**
 * Card interno com o resumo automático da Nina no handoff.
 * Uso interno da equipe: nada aqui é enviado ao paciente.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { obterResumoHandoff } from "@/lib/atendimento/handoff-resumo.functions";
import { blocosVisiveis, ROTULO_INTENCAO, type ResumoHandoff } from "@/lib/atendimento/handoff-resumo";

type Linha = {
  status: "gerando" | "ok" | "erro";
  payload: ResumoHandoff | null;
  erro: string | null;
  versao: number;
} | null;

export function ResumoHandoffCard({
  clinicaId,
  conversaId,
}: {
  clinicaId: string;
  conversaId: string;
}) {
  const obter = useServerFn(obterResumoHandoff);
  const [linha, setLinha] = useState<Linha>(null);
  const [carregando, setCarregando] = useState(false);
  // Regra: cada conversa começa com o resumo RECOLHIDO.
  const [aberto, setAberto] = useState(false);
  const [atualizado, setAtualizado] = useState(false);

  const carregar = useCallback(
    async (forcar = false) => {
      setCarregando(true);
      try {
        const r = (await obter({ data: { clinicaId, conversaId, forcar } })) as Linha;
        setLinha((anterior) => {
          if (anterior && r && anterior.versao !== r.versao) setAtualizado(true);
          return r;
        });
      } catch {
        setLinha({ status: "erro", payload: null, erro: "Não foi possível gerar o resumo.", versao: 0 });
      } finally {
        setCarregando(false);
      }
    },
    [clinicaId, conversaId, obter],
  );

  useEffect(() => {
    void carregar(false);
  }, [carregar]);

  // Resumo gerado pelo servidor (inclusive no timeout) aparece sem refresh.
  useRealtimeRefresh(["atend_handoff_resumos", "atend_conversas"], () => void carregar(false));

  if (!linha) return null;

  const r = linha.payload;
  return (
    <div className="sticky top-0 z-20 rounded-lg border border-purple-300/70 bg-purple-50 text-purple-950 shadow-sm dark:border-purple-400/30 dark:bg-purple-950/95 dark:text-purple-100">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          onClick={() => {
            setAberto((v) => !v);
            setAtualizado(false);
          }}
          aria-expanded={aberto}
        >
          {aberto ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )}
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="truncate text-xs font-semibold uppercase tracking-wide">
            Resumo da Nina
            {r ? ` · ${ROTULO_INTENCAO[r.intencao]}` : ""}
          </span>
          {atualizado && !aberto && (
            <span className="shrink-0 rounded bg-purple-300/70 px-1.5 py-0.5 text-[10px] font-medium dark:bg-purple-400/30">
              atualizado
            </span>
          )}
        </button>
        <span className="shrink-0 rounded bg-purple-200/70 px-1.5 py-0.5 text-[10px] font-medium dark:bg-purple-400/20">
          uso interno
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          title="Gerar novamente"
          aria-label="Gerar resumo novamente"
          disabled={carregando}
          onClick={() => void carregar(true)}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {aberto && (
        <div className="max-h-[40vh] space-y-2 overflow-y-auto overscroll-contain border-t border-purple-200/70 px-3 py-2 text-xs dark:border-purple-400/20">

          {carregando && !r && <p>Gerando resumo da conversa…</p>}
          {linha.status === "erro" && (
            <p className="text-atd-danger-ink">
              {linha.erro ?? "Falha ao gerar o resumo."} A transferência não foi afetada.
            </p>
          )}
          {r && (
            <>
              {r.agendamento_confirmado && (
                <p className="rounded bg-purple-100 px-2 py-1 dark:bg-purple-400/15">
                  <strong>Agendamento confirmado:</strong>{" "}
                  {[
                    r.agendamento_confirmado.servico,
                    r.agendamento_confirmado.medico,
                    r.agendamento_confirmado.data,
                    r.agendamento_confirmado.hora,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {blocosVisiveis(r).map((b) => (
                <div key={b.titulo}>
                  <p className="font-semibold">{b.titulo}</p>
                  {b.itens.length === 1 ? (
                    <p>{b.itens[0]}</p>
                  ) : (
                    <ul className="list-disc pl-4">
                      {b.itens.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {r.motivo_handoff && (
                <p className="opacity-80">
                  <strong>Motivo da transferência:</strong> {r.motivo_handoff}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * FASE 7 — Avaliação automática da homologação (GPT Sol como juiz).
 *
 * O avaliador é independente: não conversa com o paciente, não altera a Nina e
 * não muda nenhum registro do atendimento. Ele apenas analisa as evidências já
 * gravadas da conversa de teste e devolve um parecer com notas e achados.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Gavel, Loader2 } from "lucide-react";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { avaliarComSol, listarAvaliacoesSol } from "@/lib/nina/avaliador-sol.functions";
import { listarCenarios } from "@/lib/nina/cenarios.functions";
import {
  MODELO_SOL,
  ROTULO_DIMENSAO,
  ROTULO_RESULTADO,
  type Achado,
  type NotaDimensao,
  type Resultado,
} from "@/lib/nina/avaliador-sol";

type Props = { clinicaId: string | undefined; leadId: string | null; podeAvaliar: boolean };

const COR_RESULTADO: Record<Resultado, string> = {
  aprovado: "bg-atd-go text-atd-on-strong",
  aprovado_observacao: "bg-atd-warn-bg text-atd-warn-ink",
  reprovado: "bg-atd-danger-bg text-atd-danger-ink",
  erro_critico: "bg-destructive text-destructive-foreground",
};

const ROTULO_GRAVIDADE: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

function Avaliacao({ a }: { a: any }) {
  const dimensoes = (a.dimensoes ?? []) as NotaDimensao[];
  const achados = (a.achados ?? []) as Achado[];
  const lacunas = (a.evidencias?.lacunas ?? []) as string[];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={COR_RESULTADO[a.resultado as Resultado] ?? ""}>
          {ROTULO_RESULTADO[a.resultado as Resultado] ?? a.resultado}
        </Badge>
        <span className="text-sm font-medium">{a.score}/100</span>
        <span className="text-xs text-muted-foreground">
          {new Date(a.created_at).toLocaleString("pt-BR")} · {a.mensagens_avaliadas} mensagens ·
          instruções v{a.prompt_versao ?? "—"}
        </span>
      </div>

      {a.resumo ? <p className="text-sm">{a.resumo}</p> : null}

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Rubrica</h4>
        <div className="grid gap-1 sm:grid-cols-2">
          {dimensoes.map((d) => (
            <div key={d.dimensao} className="rounded border p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{ROTULO_DIMENSAO[d.dimensao] ?? d.dimensao}</span>
                <span className="shrink-0">
                  {d.situacao === "avaliada"
                    ? `${d.nota}/10`
                    : d.situacao === "nao_aplicavel"
                      ? "não se aplica"
                      : "não verificável"}
                </span>
              </div>
              {d.justificativa ? (
                <p className="mt-1 text-muted-foreground">{d.justificativa}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          Achados com evidência
        </h4>
        {achados.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum problema com evidência foi apontado.</p>
        ) : (
          <ul className="space-y-2">
            {achados.map((c, i) => (
              <li key={i} className="rounded border p-2 text-xs">
                <div className="mb-1 flex flex-wrap gap-2">
                  <Badge variant="outline">{ROTULO_GRAVIDADE[c.gravidade] ?? c.gravidade}</Badge>
                  <Badge variant="outline">confiança {c.confianca}</Badge>
                  {c.dimensao ? (
                    <Badge variant="outline">{ROTULO_DIMENSAO[c.dimensao] ?? c.dimensao}</Badge>
                  ) : null}
                </div>
                <p>
                  <strong>Mensagem:</strong> {c.mensagem}
                </p>
                <p>
                  <strong>Observado:</strong> {c.observado}
                </p>
                <p>
                  <strong>Esperado:</strong> {c.esperado}
                </p>
                <p className="text-muted-foreground">
                  Fonte: {c.fonte} · Componente: {c.componente}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lacunas.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            Não foi possível verificar
          </h4>
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {lacunas.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AvaliacaoSol({ clinicaId, leadId, podeAvaliar }: Props) {
  const avaliar = useServerFn(avaliarComSol);
  const listar = useServerFn(listarAvaliacoesSol);
  const listarCen = useServerFn(listarCenarios);

  const [aberto, setAberto] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [atual, setAtual] = useState<any | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [cenarios, setCenarios] = useState<{ id: string; nome: string }[]>([]);
  const [cenarioId, setCenarioId] = useState<string>("nenhum");

  const carregar = useCallback(async () => {
    if (!clinicaId || !leadId) return;
    try {
      const [r, c] = await Promise.all([
        listar({ data: { clinicaId, leadId, limite: 10 } }),
        listarCen({ data: { clinicaId } }),
      ]);
      setHistorico((r as any).avaliacoes ?? []);
      setAtual(((r as any).avaliacoes ?? [])[0] ?? null);
      setCenarios(
        (((c as any).cenarios ?? []) as any[])
          .filter((x) => x.status !== "arquivado")
          .map((x) => ({ id: x.id, nome: x.nome })),
      );
    } catch (e) {
      mostrarErro(e);
    }
  }, [clinicaId, leadId, listar, listarCen]);

  useEffect(() => {
    if (aberto) void carregar();
  }, [aberto, carregar]);

  const executar = useCallback(async () => {
    if (!clinicaId || !leadId) return;
    setRodando(true);
    try {
      const r = await avaliar({
        data: { clinicaId, leadId, cenarioId: cenarioId === "nenhum" ? null : cenarioId },
      });
      setAtual((r as any).avaliacao);
      void carregar();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setRodando(false);
    }
  }, [avaliar, carregar, cenarioId, clinicaId, leadId]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!leadId}
        onClick={() => setAberto(true)}
      >
        <Gavel className="mr-1 h-3.5 w-3.5" /> Avaliar com Sol
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Avaliação automática da conversa de teste</DialogTitle>
            <DialogDescription>
              Um avaliador independente ({MODELO_SOL}) analisa somente as evidências já gravadas
              desta conversa: mensagens, respostas, versão das instruções, conhecimento consultado e
              o resultado real das ferramentas. Ele não conversa com o paciente e não altera nada da
              Nina.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">
              Cenário esperado (opcional)
              <Select value={cenarioId} onValueChange={setCenarioId}>
                <SelectTrigger className="mt-1 h-9 w-[280px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-50">
                  <SelectItem value="nenhum">Sem cenário da biblioteca</SelectItem>
                  {cenarios.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button disabled={!podeAvaliar || rodando || !leadId} onClick={() => void executar()}>
              {rodando ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Gavel className="mr-1 h-4 w-4" />
              )}
              Avaliar agora
            </Button>
          </div>

          {rodando && (
            <p className="text-sm text-muted-foreground">Analisando as evidências desta conversa…</p>
          )}

          {atual ? (
            <Avaliacao a={atual} />
          ) : (
            !rodando && (
              <p className="text-sm text-muted-foreground">
                Nenhuma avaliação ainda para este lead de teste.
              </p>
            )
          )}

          {historico.length > 1 && (
            <div>
              <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Avaliações anteriores
              </h4>
              <ul className="space-y-1">
                {historico.slice(1).map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setAtual(h)}
                      className="w-full rounded border p-2 text-left text-xs hover:bg-muted"
                    >
                      {new Date(h.created_at).toLocaleString("pt-BR")} ·{" "}
                      {ROTULO_RESULTADO[h.resultado as Resultado] ?? h.status} · {h.score ?? "—"}/100
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

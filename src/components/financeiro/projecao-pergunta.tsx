/**
 * "Pergunte à projeção" — caixa de pergunta livre da aba Financeiro → Projeção.
 *
 * A IA só é chamada no clique (ou Enter). A resposta em texto vem da IA; a
 * tabela de atendimentos por dia da semana mostrada junto vem do cálculo do
 * sistema (`montarContextoPergunta`), nunca do texto do modelo.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCcw, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { mostrarErro } from "@/lib/traduzir-erro";
import { perguntarProjecao } from "@/lib/financeiro/projecao-ia.functions";
import {
  montarContextoPergunta,
  type ContextoPergunta,
  type EntradaPergunta,
} from "@/lib/financeiro/projecao-pergunta";

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SUGESTOES = [
  "Quantos atendimentos preciso fazer por dia da semana para fechar 1,1 milhão?",
  "Para crescer 10% sobre o mês passado, quanto preciso fazer na sexta e no sábado?",
  "Se continuar no ritmo de hoje, quanto vamos fechar o mês?",
  "Qual dia da semana rende mais e qual rende menos?",
];

type Turno = {
  pergunta: string;
  resposta: string;
  calculo: ContextoPergunta;
};

type Props = Omit<EntradaPergunta, "pergunta"> & { carregando: boolean };

export function ProjecaoPergunta({ carregando, ...dados }: Props) {
  const perguntar = useServerFn(perguntarProjecao);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);

  const enviar = async (pergunta: string) => {
    const p = pergunta.trim();
    if (p.length < 3 || enviando || carregando) return;
    setEnviando(true);
    try {
      const anterior = turnos[0]?.calculo.alvo;
      const calculo = montarContextoPergunta({
        ...dados,
        pergunta: p,
        alvoAnterior:
          anterior && anterior.origem !== "meta da tela"
            ? { valor: anterior.valor, explicacao: anterior.explicacao }
            : null,
      });
      // As 6 últimas trocas vão junto, da mais antiga à mais nova, para a IA
      // entender continuações como "e no sábado?".
      const conversa = turnos
        .slice(0, 6)
        .reverse()
        .map((t) => ({ pergunta: t.pergunta, resposta: t.resposta }));
      const { resposta } = await perguntar({
        data: { pergunta: p, contexto: calculo.contexto, conversa },
      });
      // A tela guarda a conversa enquanto estiver aberta (até 30 trocas).
      setTurnos((t) => [{ pergunta: p, resposta, calculo }, ...t].slice(0, 30));
      setTexto("");
    } catch (e) {
      mostrarErro(e as Error, "Não foi possível responder a pergunta");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Pergunte à projeção
            </h2>
            {turnos.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setTurnos([])} disabled={enviando}>
                <RotateCcw className="h-4 w-4" />
                Nova conversa
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Escreva o que quer saber sobre o fechamento do mês — dá para continuar a conversa ("e no
            sábado?"). As contas são feitas pelo sistema com os números desta tela; a IA só explica
            a resposta.
          </p>
        </div>

        <div className="space-y-2">
          <Textarea
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                void enviar(texto);
              }
            }}
            maxLength={600}
            rows={2}
            placeholder="Ex.: quantos atendimentos preciso fazer por dia da semana para fechar 1,1 milhão?"
            disabled={enviando}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                  onClick={() => void enviar(s)}
                  disabled={enviando || carregando}
                >
                  {s}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              onClick={() => void enviar(texto)}
              disabled={enviando || carregando || texto.trim().length < 3}
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Perguntar
            </Button>
          </div>
        </div>

        {turnos.map((t, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-medium">{t.pergunta}</p>
            <p className="text-sm whitespace-pre-line text-foreground/90">{t.resposta}</p>
            {t.calculo.tabela &&
              t.calculo.tabela.falta > 0 &&
              t.calculo.tabela.linhas.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Cálculo do sistema · {t.calculo.alvo?.explicacao}
                  </p>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium">Dia</th>
                          <th className="px-2 py-1.5 text-right font-medium">Costuma fazer</th>
                          <th className="px-2 py-1.5 text-right font-medium">Precisa fazer</th>
                          <th className="px-2 py-1.5 text-right font-medium">Receita/dia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.calculo.tabela.linhas.map((l) => (
                          <tr key={l.diaSemana} className="border-t">
                            <td className="px-2 py-1.5">{l.nome}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {l.atendimentosHoje}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                              {l.atendimentosNecessarios}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {fmt(l.receitaNecessaria)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

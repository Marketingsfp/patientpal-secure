/**
 * Painel de confiabilidade das respostas da Nina.
 *
 * Mostra, por período, quantas respostas saíram direto, quantas viraram
 * pergunta de esclarecimento e quantas foram para a equipe — e por quê.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resumoConfiancaNina, type ResumoConfianca } from "@/lib/nina/confianca.functions";

const ROTULO_BLOQUEIO: Record<string, string> = {
  VALOR_SEM_CATALOGO: "Valor sem catálogo publicado",
  AGENDA_SEM_CONFIRMACAO: "Agenda/profissional sem confirmação",
  FERRAMENTA_FALHOU: "Consulta ao sistema falhou",
  PREPARO_SEM_FONTE: "Preparo ou regra sem fonte",
};

const ROTULO_CATEGORIA: Record<string, string> = {
  valor: "Valores",
  horario: "Horários",
  profissional: "Profissionais",
  disponibilidade: "Disponibilidade",
  preparo: "Preparo de exame",
  regra: "Regras e restrições",
  agendamento: "Agendamento",
  clinico_administrativo: "Dados do paciente",
};

export function ConfiancaRespostas({ clinicaId }: { clinicaId: string | null | undefined }) {
  const buscar = useServerFn(resumoConfiancaNina);
  const [dados, setDados] = useState<ResumoConfianca | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [ambiente, setAmbiente] = useState<"todos" | "producao" | "homologacao">("todos");

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const r = (await buscar({ data: { clinicaId, dias: 7, ambiente } })) as ResumoConfianca;
      setDados(r);
    } catch {
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [buscar, clinicaId, ambiente]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!clinicaId) return null;

  const total = dados?.total ?? 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Confiabilidade das respostas (7 dias)
        </CardTitle>
        <div className="flex items-center gap-1">
          {(["todos", "producao", "homologacao"] as const).map((a) => (
            <Button
              key={a}
              size="sm"
              variant={ambiente === a ? "default" : "outline"}
              onClick={() => setAmbiente(a)}
            >
              {a === "todos" ? "Tudo" : a === "producao" ? "Atendimento" : "Homologação"}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => void carregar()} disabled={carregando}>
            {carregando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            <span className="sr-only">Atualizar</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma decisão registrada neste período.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Bloco titulo="Respondeu" valor={dados!.responder} sufixo={`${pct(dados!.responder)}%`} />
              <Bloco
                titulo="Pediu esclarecimento"
                valor={dados!.esclarecer}
                sufixo={`${pct(dados!.esclarecer)}%`}
              />
              <Bloco
                titulo="Transferência confirmada"
                valor={dados!.resultados.transferenciasConfirmadas}
                sufixo={`de ${dados!.resultados.transferenciasRecomendadas} recomendadas`}
              />
              <Bloco titulo="Confiança média" valor={dados!.scoreMedio} sufixo="de 100" />
            </div>

            <p className="text-[11px] text-muted-foreground">
              {dados!.total} mensagens de saída · {dados!.avaliacoes} avaliações registradas
              (resposta e ação da mesma mensagem contam uma vez).
              {dados!.resultados.transferenciasEmObservacao > 0
                ? ` ${dados!.resultados.transferenciasEmObservacao} recomendações em modo observação não transferiram o atendimento.`
                : ""}
              {dados!.amostra.truncado ? " Recorte parcial: leitura limitada ao teto do período." : ""}
            </p>

            {dados!.porBloqueio.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  Motivos de transferência imediata
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {dados!.porBloqueio.map((b) => (
                    <Badge key={b.bloqueio} variant="destructive">
                      {ROTULO_BLOQUEIO[b.bloqueio] ?? b.bloqueio} · {b.total}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {dados!.porCategoria.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  Tipos de informação avaliados
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {dados!.porCategoria.map((c) => (
                    <Badge key={c.categoria} variant="secondary">
                      {ROTULO_CATEGORIA[c.categoria] ?? c.categoria} · {c.total}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Últimas decisões</p>
              <ul className="divide-y divide-border rounded-md border border-border">
                {dados!.ultimas.map((u) => (
                  <li key={u.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                    <Badge
                      variant={
                        u.acao === "transferir"
                          ? "destructive"
                          : u.acao === "esclarecer"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {u.acao}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{u.motivos.join("; ") || "—"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(u.created_at).toLocaleString("pt-BR")} ·{" "}
                        {u.ambiente === "homologacao" ? "Homologação" : "Atendimento"} · confiança{" "}
                        {u.score}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Bloco({ titulo, valor, sufixo }: { titulo: string; valor: number; sufixo: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{titulo}</p>
      <p className="text-xl font-bold tabular-nums">{valor}</p>
      <p className="text-[11px] text-muted-foreground">{sufixo}</p>
    </div>
  );
}

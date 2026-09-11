/**
 * FASE 9 — Autoavaliação e melhoria contínua.
 *
 * Painel de revisão: mostra a correlação entre confiança, erro reportado,
 * transferência, agendamento e resultado da conversa, e lista as PROPOSTAS
 * de ajuste. Nada entra em vigor sem aprovação e aplicação por uma pessoa.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, RefreshCw, ScaleIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calibracaoConfiancaNina,
  configuracaoConfiancaVigente,
  decidirPropostaConfianca,
  listarPropostasConfianca,
  registrarPropostasConfianca,
  type ConfiguracaoConfiancaView,
  type PropostaConfiancaView,
} from "@/lib/nina/confianca.functions";
import type { RelatorioCalibracao } from "@/lib/nina/confidence/calibracao";

const ROTULO_FAIXA: Record<string, string> = {
  "90_100": "Confiança 90–100",
  "75_89": "Confiança 75–89",
  "50_74": "Confiança 50–74",
  "0_49": "Confiança abaixo de 50",
};

const ROTULO_STATUS: Record<string, string> = {
  pendente: "Aguardando revisão",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  aplicada: "Em vigor",
  revertida: "Revertida",
  // FASE 6 — aprovada, mas depende de mudança no sistema: nunca "Em vigor".
  implementacao_pendente: "Implementação pendente",
};

const ROTULO_ORIGEM: Record<string, string> = {
  padrao: "Configuração padrão",
  clinica: "Configuração da clínica",
  cache_vencido: "Última configuração conhecida (leitura indisponível)",
  fallback_padrao: "Padrão de emergência (leitura indisponível)",
};

export function CalibracaoConfianca({ clinicaId }: { clinicaId: string }) {
  const calibrar = useServerFn(calibracaoConfiancaNina);
  const listar = useServerFn(listarPropostasConfianca);
  const registrar = useServerFn(registrarPropostasConfianca);
  const decidir = useServerFn(decidirPropostaConfianca);

  const lerConfiguracao = useServerFn(configuracaoConfiancaVigente);
  const [config, setConfig] = useState<ConfiguracaoConfiancaView | null>(null);
  const [dados, setDados] = useState<RelatorioCalibracao | null>(null);
  const [propostas, setPropostas] = useState<PropostaConfiancaView[]>([]);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const [r, p, c] = await Promise.all([
        calibrar({ data: { clinicaId, dias: 30, ambiente: "producao" } }),
        listar({ data: { clinicaId } }),
        lerConfiguracao({ data: { clinicaId } }).catch(() => null),
      ]);
      setDados(r);
      setPropostas(p);
      setConfig(c);
    } catch {
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [calibrar, clinicaId, lerConfiguracao, listar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const enviarParaRevisao = async () => {
    if (!dados || dados.propostas.length === 0) return;
    try {
      await registrar({
        data: {
          clinicaId,
          propostas: dados.propostas.map((p) => ({
            tipo: p.tipo,
            alvo: p.alvo,
            valorAtual: p.valorAtual,
            valorSugerido: p.valorSugerido,
            justificativa: p.justificativa,
            evidencia: p.evidencia as unknown as Record<string, unknown>,
          })),
        },
      });
      toast.success("Sugestões enviadas para revisão.");
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar as sugestões.");
    }
  };

  const decidirProposta = async (
    id: string,
    decisao: "aprovada" | "rejeitada" | "aplicada" | "revertida",
  ) => {
    try {
      await decidir({ data: { clinicaId, propostaId: id, decisao } });
      toast.success(`Proposta ${ROTULO_STATUS[decisao]?.toLowerCase() ?? decisao}.`);
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a decisão.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScaleIcon className="h-4 w-4" />
          Autoavaliação da confiabilidade
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void carregar()} disabled={carregando}>
          {carregando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* FASE 6 — a configuração em vigor aparece com identidade própria:
            mudar um limite gera outra identidade e as respostas antigas
            continuam com a configuração da época. */}
        <div className="rounded-md border p-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Configuração em vigor</p>
          {!config ? (
            <p className="text-muted-foreground">Não foi possível ler a configuração agora.</p>
          ) : (
            <div className="space-y-1">
              <p>
                <span className="font-medium">{ROTULO_ORIGEM[config.origem] ?? config.origem}</span>{" "}
                · identidade {config.configId}
              </p>
              <p className="text-muted-foreground">
                Limites: alta a partir de {config.limites.HIGH}, intermediária a partir de{" "}
                {config.limites.MEDIUM} · Etapa de ativação {config.etapa} · Algoritmo{" "}
                {config.versaoPolitica}/{config.versaoMotor}
                {config.vigenteDesde
                  ? ` · em vigor desde ${new Date(config.vigenteDesde).toLocaleString("pt-BR")}`
                  : ""}
              </p>
              {config.degradada && (
                <p className="text-destructive">
                  Atenção: a configuração da clínica não pôde ser lida ({config.motivoDegradacao}).
                  O sistema está usando a configuração indicada acima até a leitura voltar.
                </p>
              )}
              {config.descartadas.length > 0 && (
                <p className="text-destructive">
                  Ajustes recusados na validação (a configuração válida foi preservada):{" "}
                  {config.descartadas.map((d) => `${d.alvo} (${d.motivo})`).join(", ")}
                </p>
              )}
              {config.implementacaoPendente.length > 0 && (
                <p className="text-muted-foreground">
                  Aprovados, porém dependem de mudança no sistema:{" "}
                  {config.implementacaoPendente.map((d) => d.alvo).join(", ")}
                </p>
              )}
            </div>
          )}
        </div>
        {!dados ? (
          <p className="text-sm text-muted-foreground">
            {carregando ? "Carregando…" : "Sem dados no período."}
          </p>
        ) : (
          <>
            {/* FASE 7 — sem amostra suficiente o painel diz que é inconclusivo,
                em vez de dar a impressão de calibração aprovada. */}
            {!dados.conclusao.conclusiva && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="font-medium">Resultado inconclusivo</p>
                <p className="text-muted-foreground">
                  {dados.conclusao.motivo} Com menos de {dados.conclusao.amostraMinima} respostas
                  avaliadas não é possível dizer se a calibração está boa ou ruim.
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Comparação feita com os limites em vigor: alta a partir de{" "}
              {dados.politicaAplicada.limiteAlta}, intermediária a partir de{" "}
              {dados.politicaAplicada.limiteIntermediaria} (
              {ROTULO_ORIGEM[dados.politicaAplicada.origem] ?? dados.politicaAplicada.origem}
              {dados.politicaAplicada.configId
                ? ` · identidade ${dados.politicaAplicada.configId}`
                : ""}
              ). A cobertura considera as verificações aplicáveis a cada resposta; o que não pôde
              ser extraído ou avaliado não conta como acerto.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Respostas avaliadas</p>
                <p className="text-lg font-semibold">{dados.total}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Com erro reportado</p>
                <p className="text-lg font-semibold">
                  {dados.comErroReportado} ({dados.taxaErroGeral}%)
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Confiança alta com erro</p>
                <p className="text-lg font-semibold">{dados.altaConfiancaComErro}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Bloqueio possivelmente indevido</p>
                <p className="text-lg font-semibold">{dados.bloqueioIndevido}</p>
                <p className="text-[11px] text-muted-foreground">
                  Transferência recomendada sem erro confirmado e sem transferência registrada.
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Reportes ainda em revisão</p>
                <p className="text-lg font-semibold">{dados.reportesPendentes}</p>
                <p className="text-[11px] text-muted-foreground">
                  Não contam como erro nem como acerto.
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Amostra usada</p>
                <p className="text-lg font-semibold">
                  {dados.amostra.usadas} de {dados.amostra.elegiveis}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {dados.amostra.estratificada
                    ? `Amostra estratificada (até ${dados.amostra.tamanhoPorFaixa} por faixa)`
                    : "Todas as decisões elegíveis"}
                  {dados.amostra.politicaVersao
                    ? ` · política ${dados.amostra.politicaVersao}`
                    : ""}
                  . Modo observacional fica de fora.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Faixa</th>
                    <th className="p-2 text-right">Respostas</th>
                    <th className="p-2 text-right">Liberadas</th>
                    <th className="p-2 text-right">Transferidas</th>
                    <th className="p-2 text-right">Erro reportado</th>
                    <th className="p-2 text-right">Agend. confirmados</th>
                    <th className="p-2 text-right">Conversas resolvidas</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.porFaixa.map((f) => (
                    <tr key={f.faixa} className="border-t">
                      <td className="p-2">{ROTULO_FAIXA[f.faixa] ?? f.faixa}</td>
                      <td className="p-2 text-right">{f.decisoes}</td>
                      <td className="p-2 text-right">{f.liberadas}</td>
                      <td className="p-2 text-right">{f.handoffs}</td>
                      <td className="p-2 text-right">
                        {f.comErroReportado} ({f.taxaErro}%)
                      </td>
                      <td className="p-2 text-right">{f.agendamentosConfirmados}</td>
                      <td className="p-2 text-right">{f.conversasResolvidas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Sugestões da análise ({dados.propostas.length}) — nada muda sozinho
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={dados.propostas.length === 0}
                  onClick={() => void enviarParaRevisao()}
                >
                  Enviar para revisão
                </Button>
              </div>
              {dados.propostas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {dados.conclusao.conclusiva
                    ? "Nenhum ajuste sugerido: a calibração está dentro do esperado."
                    : "Nenhum ajuste sugerido — mas a amostra é insuficiente, então isso não comprova que a calibração está adequada."}
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {dados.propostas.map((p, i) => (
                    <li key={`${p.alvo}-${i}`} className="rounded border p-2">
                      <p className="font-medium">
                        {p.alvo}: {String(p.valorAtual ?? "—")} → {String(p.valorSugerido ?? "—")}
                      </p>
                      <p className="text-muted-foreground">{p.justificativa}</p>
                      <p className="text-muted-foreground">{p.efeito}</p>
                      <p className="text-xs text-muted-foreground">
                        Base: {p.evidencia.amostra} casos, {p.evidencia.comErro} com erro (
                        {p.evidencia.taxaErro}%)
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-md border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Propostas em revisão
              </p>
              {propostas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma proposta registrada.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {propostas.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                      <Badge variant="outline">{ROTULO_STATUS[p.status] ?? p.status}</Badge>
                      <span className="font-medium">{p.alvo}</span>
                      <span className="text-muted-foreground">
                        {String(p.valor_atual ?? "—")} → {String(p.valor_sugerido ?? "—")}
                      </span>
                      <span className="ml-auto flex gap-1">
                        {p.status === "pendente" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void decidirProposta(p.id, "aprovada")}
                            >
                              <Check className="mr-1 h-3 w-3" /> Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void decidirProposta(p.id, "rejeitada")}
                            >
                              <X className="mr-1 h-3 w-3" /> Rejeitar
                            </Button>
                          </>
                        )}
                        {p.status === "aprovada" && (
                          <Button
                            size="sm"
                            onClick={() => void decidirProposta(p.id, "aplicada")}
                          >
                            Colocar em vigor
                          </Button>
                        )}
                        {p.status === "aplicada" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void decidirProposta(p.id, "revertida")}
                          >
                            Reverter
                          </Button>
                        )}
                        {p.status === "implementacao_pendente" && (
                          <span className="text-xs text-muted-foreground">
                            Depende de mudança no sistema para produzir efeito.
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Aba "Análise" do Coach: ligações da telefonia (Sufficit).
 *
 * DADO DE PACIENTE: telefones e transcrições ficam só no estado desta tela.
 * Nada vai para URL nossa, log, console ou localStorage. O WhatsApp abre só
 * com o número (wa.me/<número>), sem texto pré-montado.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageCircle, PhoneIncoming, Sparkles, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResultView } from "@/components/coach/painel-views";
import { ProcessarLoteLigacoes } from "@/components/coach/ProcessarLoteLigacoes";
import type { AnalysisResult } from "@/lib/coach/analyze.functions";
import {
  analisarLigacao,
  buscarTranscricaoLigacao,
  cotaIACoach,
  lerTranscricaoLigacao,
  ligacoesParaAnalise,
} from "@/lib/coach/telefonia.functions";
import { foiAtendida, ehRecebida, linkWhatsApp, resumirSemResposta } from "@/lib/telefonia/sem-resposta";

type Dados = Awaited<ReturnType<typeof ligacoesParaAnalise>>;
type Cota = Awaited<ReturnType<typeof cotaIACoach>>;

const TZ = "America/Sao_Paulo";
const diaSP = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const fmtDur = (s: number | null) =>
  s == null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Meia-noite de São Paulo (UTC-3, sem horário de verão) em ISO. */
const inicioDiaSP = (dia: string) => new Date(`${dia}T00:00:00-03:00`).toISOString();
const fimDiaSP = (dia: string) => new Date(`${dia}T23:59:59.999-03:00`).toISOString();

export function AnaliseLigacoes({
  clinicaId,
  clinicaNome,
}: {
  clinicaId: string | null;
  clinicaNome: string;
}) {
  const carregar = useServerFn(ligacoesParaAnalise);
  const fnTranscrever = useServerFn(buscarTranscricaoLigacao);
  const fnLer = useServerFn(lerTranscricaoLigacao);
  const fnAnalisar = useServerFn(analisarLigacao);
  const fnCota = useServerFn(cotaIACoach);

  const hoje = new Date();
  const [de, setDe] = useState(diaSP(new Date(hoje.getTime() - 6 * 86_400_000)));
  const [ate, setAte] = useState(diaSP(hoje));
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cota, setCota] = useState<Cota | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Record<string, string>>({});
  const [aberta, setAberta] = useState<{ id: string; texto?: string; resultado?: AnalysisResult } | null>(
    null,
  );

  const atualizar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await carregar({ data: { clinicaId, start: inicioDiaSP(de), end: fimDiaSP(ate) } });
      setDados(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, de, ate, carregar]);

  const atualizarCota = useCallback(async () => {
    if (!clinicaId) return;
    try {
      setCota(await fnCota({ data: { clinicaId } }));
    } catch {
      setCota(null);
    }
  }, [clinicaId, fnCota]);

  useEffect(() => {
    void atualizar();
    void atualizarCota();
    // Só ao abrir/trocar de clínica; o período recarrega pelo botão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaId]);

  const resumo = useMemo(() => resumirSemResposta(dados?.linhas ?? []), [dados]);
  const atendidas = useMemo(
    () => (dados?.linhas ?? []).filter((l) => foiAtendida(l)),
    [dados],
  );
  const maxHora = Math.max(1, ...resumo.porHora.map((h) => h.atendidas + h.naoAtendidas));

  async function transcrever(id: string) {
    if (!clinicaId) return;
    setOcupado(id);
    setAviso((a) => ({ ...a, [id]: "Pedindo à Sufficit… pode levar até 3 minutos." }));
    try {
      const r = await fnTranscrever({ data: { clinicaId, externoId: id } });
      const msg = !r.ok
        ? r.erro
        : r.situacao === "em_processamento"
          ? "A Sufficit ainda está transcrevendo. Tente de novo em alguns minutos."
          : r.situacao === "ja_existia"
            ? "Já estava guardada."
            : `Guardada (${r.caracteres} caracteres).`;
      setAviso((a) => ({ ...a, [id]: msg }));
      if (r.ok && r.situacao !== "em_processamento") await atualizar();
    } catch (e) {
      setAviso((a) => ({ ...a, [id]: e instanceof Error ? e.message : "Falhou." }));
    } finally {
      setOcupado(null);
    }
  }

  async function verTexto(id: string) {
    if (!clinicaId) return;
    const t = await fnLer({ data: { clinicaId, externoId: id } });
    setAberta({ id, texto: t?.texto ?? "", resultado: dados?.analises[id]?.resultado });
  }

  async function analisar(id: string) {
    if (!clinicaId) return;
    setOcupado(id);
    setAviso((a) => ({ ...a, [id]: "Analisando…" }));
    try {
      const r = await fnAnalisar({ data: { clinicaId, externoId: id } });
      setAberta({ id, resultado: r });
      setAviso((a) => ({ ...a, [id]: "Análise pronta." }));
      await Promise.all([atualizar(), atualizarCota()]);
    } catch (e) {
      setAviso((a) => ({ ...a, [id]: e instanceof Error ? e.message : "Falhou." }));
    } finally {
      setOcupado(null);
    }
  }

  const semCota = !!cota && (cota.restaUsuario <= 0 || cota.restaClinica <= 0);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Dados da clínica</div>
        <div className="text-lg font-semibold">{clinicaNome || "—"}</div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="an-de">De</Label>
            <Input id="an-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="an-ate">Até</Label>
            <Input id="an-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <Button onClick={() => void atualizar()} disabled={carregando || !clinicaId}>
            {carregando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Atualizar
          </Button>
          <span className="text-xs text-muted-foreground">Horários de São Paulo.</span>
        </div>
        {erro ? <p className="mt-3 text-sm text-destructive">{erro}</p> : null}
      </div>

      {/* Bloco 1 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Quem ficou sem resposta</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Cartao titulo="Ligações recebidas" valor={resumo.recebidas} />
          <Cartao titulo="Atendidas" valor={resumo.atendidas} />
          <Cartao titulo="Não atendidas" valor={resumo.naoAtendidas} destaque />
          <Cartao titulo="Pessoas que nunca conseguiram falar" valor={resumo.nuncaFalaram} destaque />
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="mb-3 font-medium">Ligações recebidas por hora do dia</h3>
          <div className="flex h-40 items-end gap-1">
            {resumo.porHora.map((h) => {
              const total = h.atendidas + h.naoAtendidas;
              return (
                <div key={h.hora} className="flex flex-1 flex-col items-center gap-1" title={`${h.hora}h: ${h.atendidas} atendidas, ${h.naoAtendidas} não atendidas`}>
                  <div className="flex w-full flex-col justify-end" style={{ height: "8rem" }}>
                    <div className="w-full rounded-t bg-destructive/70" style={{ height: `${(h.naoAtendidas / maxHora) * 100}%` }} />
                    <div className="w-full bg-primary/70" style={{ height: `${(h.atendidas / maxHora) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{total ? h.hora : ""}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 bg-primary/70" />Atendidas</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 bg-destructive/70" />Não atendidas</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Número</th>
                <th className="p-3">Tentativas</th>
                <th className="p-3">Primeira</th>
                <th className="p-3">Última</th>
                <th className="p-3">Foi atendido?</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {resumo.grupos.map((g) => {
                const wa = linkWhatsApp(g);
                return (
                  <tr key={g.rotulo + g.primeira} className="border-b last:border-0">
                    <td className="p-3 font-mono text-xs">
                      {g.rotulo}
                      {g.interno ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">ramal/interno</span> : null}
                    </td>
                    <td className="p-3">{g.tentativas}</td>
                    <td className="p-3">{fmtDataHora(g.primeira)}</td>
                    <td className="p-3">{fmtDataHora(g.ultima)}</td>
                    <td className="p-3">
                      {g.algumaAtendida ? (
                        <span>Sim ({g.atendidas})</span>
                      ) : (
                        <span className="font-medium text-destructive">Nunca</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {wa ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={wa} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
                          </a>
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!resumo.grupos.length ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma ligação recebida no período.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bloco 2 */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">O que foi conversado</h2>
            <p className="text-sm text-muted-foreground">
              Ligações atendidas. A transcrição vem da Sufficit e não separa quem falou. Uma análise por clique.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {cota
              ? `IA hoje — você: ${cota.restaUsuario} de ${cota.limiteUsuario} · clínica: ${cota.restaClinica} de ${cota.limiteClinica}`
              : "Cota de IA indisponível"}
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Quando</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Duração</th>
                <th className="p-3">Transcrição</th>
                <th className="p-3">Nota</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {atendidas.map((l) => {
                const chars = dados?.transcritas[l.externo_id];
                const an = dados?.analises[l.externo_id];
                const ocup = ocupado === l.externo_id;
                return (
                  <tr key={l.externo_id} className="border-b align-top last:border-0">
                    <td className="p-3">{fmtDataHora(l.inicio)}</td>
                    <td className="p-3">{ehRecebida(l) ? "Recebida" : "Feita"}</td>
                    <td className="p-3">{fmtDur(l.duracao_seg)}</td>
                    <td className="p-3">{chars != null ? `${chars} caracteres` : "—"}</td>
                    <td className="p-3">{an?.pontuacao != null ? an.pontuacao.toFixed(1) : "—"}</td>
                    <td className="space-y-1 p-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {chars == null ? (
                          <Button size="sm" variant="outline" disabled={!!ocupado} onClick={() => void transcrever(l.externo_id)}>
                            {ocup ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PhoneIncoming className="mr-1 h-4 w-4" />}
                            Buscar transcrição
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => void verTexto(l.externo_id)}>
                              <FileText className="mr-1 h-4 w-4" /> Ver
                            </Button>
                            <Button size="sm" disabled={!!ocupado || semCota} onClick={() => void analisar(l.externo_id)}>
                              {ocup ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                              {an ? "Analisar de novo" : "Analisar"}
                            </Button>
                          </>
                        )}
                      </div>
                      {aviso[l.externo_id] ? (
                        <div className="text-xs text-muted-foreground">{aviso[l.externo_id]}</div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!atendidas.length ? (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma ligação atendida no período.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {aberta ? (
          <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Ligação de {fmtDataHora(dados?.linhas.find((l) => l.externo_id === aberta.id)?.inicio ?? new Date().toISOString())}</h3>
              <Button size="sm" variant="ghost" onClick={() => setAberta(null)}>Fechar</Button>
            </div>
            {aberta.resultado ? <ResultView result={aberta.resultado} atendente="Atendente (não identificada)" /> : null}
            {aberta.texto != null ? (
              <details open={!aberta.resultado}>
                <summary className="cursor-pointer text-sm text-muted-foreground">Transcrição (sem separação de falantes)</summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{aberta.texto}</pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </section>

      <ProcessarLoteLigacoes
        clinicaId={clinicaId}
        start={inicioDiaSP(de)}
        end={fimDiaSP(ate)}
        aoAvancar={() => void atualizarCota()}
      />
    </div>
  );
}

function Cartao({ titulo, valor, destaque }: { titulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className={`mt-1 text-3xl font-semibold ${destaque ? "text-destructive" : ""}`}>{valor}</div>
    </div>
  );
}

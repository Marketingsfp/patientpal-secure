/**
 * Painel da gestora do Coach WhatsApp.
 * Adaptado do `IndexInner` do projeto de origem: a clínica, o login e as
 * permissões vêm do ClinicaOS; os dados ficam nas tabelas `coach_*`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useLocation } from "@tanstack/react-router";
import { AlertCircle, Loader2, MessageCircle, Mic, Sparkles, Upload, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { analyzeConversation, type AnalysisResult } from "@/lib/coach/analyze.functions";
import { useCoachConfig } from "@/lib/coach/config-clinica";
import { UsoIA } from "@/components/coach/UsoIA";
import { useAtendentesCoach, type CoachContexto } from "@/lib/coach/contexto";
import { useStudyTimer } from "@/lib/coach/study-time";
import { confirmDialog } from "@/lib/confirm";
import { HistoricoGestor } from "@/components/coach/HistoricoGestor";
import { VozEditor } from "@/components/coach/VozEditor";
import {
  ChecklistEditor,
  CourseView,
  HistorySidebar,
  ProfilesView,
  ResultView,
  ScriptsEditor,
  TopStat,
  type HistoryItem,
} from "@/components/coach/painel-views";
import { HistoricoSemUsuario } from "@/components/coach/HistoricoSemUsuario";
import { BaseConhecimentoEditor } from "@/components/coach/BaseConhecimentoEditor";

type Aba = "progresso" | "conversas" | "perfis" | "vozes" | "analise";

export function PainelGestora({ ctx }: { ctx: CoachContexto }) {
  const { clinicaId, clinicaNome, clinicas, atendente: nomeUsuario } = ctx;
  const analyze = useServerFn(analyzeConversation);
  const { config, salvar, atualizarBase, gerandoBase, erroBase } = useCoachConfig(
    clinicaId,
    clinicaNome,
    ctx.gestor,
  );
  const { atendentes } = useAtendentesCoach(clinicaId);

  // A aba visível é escolhida pelo menu lateral, via hash da URL.
  const hash = useLocation({ select: (l) => l.hash });
  const abaDaUrl = (["progresso", "conversas", "perfis", "vozes", "analise"] as const).includes(
    (hash ?? "") as Aba,
  )
    ? ((hash ?? "") as Aba)
    : "progresso";
  const [aba, setAba] = useState<Aba>(abaDaUrl);
  useEffect(() => {
    setAba(abaDaUrl);
  }, [abaDaUrl]);
  const [tab, setTab] = useState<"texto" | "audio">("texto");
  const [text, setText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  // A atendente avaliada é escolhida na lista de usuários da clínica com o
  // módulo Coach: a análise precisa ficar gravada no `user_id` DELA, e não no
  // de quem está avaliando.
  const [atendenteId, setAtendenteId] = useState("");
  const [selectedAtendente, setSelectedAtendente] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Gestor não é aluno: não entra no cronômetro, no ranking nem no
  // "o que fazer hoje". Só a atendente acumula tempo de estudo.
  useStudyTimer(ctx.gestor ? "" : nomeUsuario, "plataforma", ctx.gestor ? null : clinicaId);

  const atendenteSelecionada = useMemo(
    () => atendentes.find((a) => a.userId === atendenteId) ?? null,
    [atendentes, atendenteId],
  );
  const atendente = atendenteSelecionada?.nome ?? "";

  const loadHistory = useCallback(async () => {
    if (!clinicaId) return;
    const { data } = await supabase
      .from("coach_analises")
      .select("id,atendente,titulo,preview,tipo_entrada,pontuacao,sentimento,resultado,created_at")
      .eq("clinica_id", clinicaId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setHistory(data as unknown as HistoryItem[]);
  }, [clinicaId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const kpis = useMemo(() => {
    const total = history.length;
    const pessoas = new Set(history.map((h) => h.atendente).filter(Boolean)).size;
    const media = total
      ? history.reduce((s, h) => s + (Number(h.pontuacao) || 0), 0) / total
      : 0;
    const hojeStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const hoje = history.filter(
      (h) =>
        new Date(h.created_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) ===
        hojeStr,
    ).length;
    return { total, pessoas, media, hoje };
  }, [history]);

  async function saveToHistory(
    r: AnalysisResult,
    tipo: "texto" | "audio",
    sourceText: string,
    nomeAtendente: string,
    atendenteUserId: string,
  ) {
    if (!clinicaId) return;
    const preview = sourceText.replace(/\s+/g, " ").trim().slice(0, 160);
    const titulo =
      r.resumo.split(/[.!?]/)[0]?.trim().slice(0, 80) ||
      (tipo === "audio" ? "Ligação analisada" : "Conversa analisada");
    const { error: insErr } = await supabase.from("coach_analises").insert({
      clinica_id: clinicaId,
      // Identidade da pessoa AVALIADA (antes gravava a gestora logada).
      user_id: atendenteUserId,
      atendente: nomeAtendente,
      tipo_entrada: tipo,
      titulo,
      preview,
      pontuacao: r.pontuacao,
      sentimento: r.sentimento,
      resultado: r as never,
    });
    if (!insErr) void loadHistory();
  }

  async function deleteHistoryItem(id: string) {
    const ok = await confirmDialog({
      title: "Excluir análise?",
      description: "A análise sai do histórico da atendente e não dá para desfazer.",
      confirmText: "Excluir",
      tone: "danger",
    });
    if (!ok) return;
    await supabase.from("coach_analises").delete().eq("id", id);
    setHistory((h) => h.filter((x) => x.id !== id));
  }

  function openHistoryItem(item: HistoryItem) {
    setResult(item.resultado);
    setError(null);
    const daLista = atendentes.find(
      (a) => a.nome.trim().toLowerCase() === (item.atendente ?? "").trim().toLowerCase(),
    );
    setAtendenteId(daLista?.userId ?? "");
    setAba("analise");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * Envia a gravação para o armazenamento privado da clínica e devolve o
   * caminho. Antes o arquivo inteiro ia dentro da requisição (até 18 MB), o
   * que estourava com facilidade; agora só o caminho viaja.
   */
  async function enviarAudio(file: File, clinica: string): Promise<string> {
    const ext = (file.name.split(".").pop() ?? "mp3").toLowerCase().slice(0, 5);
    const caminho = `${clinica}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("coach-audios")
      .upload(caminho, file, { contentType: file.type || "audio/mpeg", upsert: false });
    if (error) throw new Error("Não foi possível enviar o áudio. Tente novamente.");
    return caminho;
  }

  async function handleAnalyze() {
    setError(null);
    setResult(null);
    const nome = atendente.trim();
    if (!atendenteSelecionada || !nome) {
      setError("Escolha a atendente antes de analisar.");
      return;
    }
    if (!clinicaId) {
      setError("Selecione a clínica antes de analisar.");
      return;
    }
    setLoading(true);
    try {
      if (tab === "texto") {
        if (text.trim().length < 20) {
          throw new Error("Cole uma conversa com pelo menos 20 caracteres.");
        }
        const r = await analyze({
          data: { clinicaId, atendente: nome, text },
        });
        setResult(r);
        await saveToHistory(r, "texto", text, nome, atendenteSelecionada.userId);
      } else {
        if (!audioFile) throw new Error("Selecione um arquivo de áudio.");
        if (audioFile.size > 25 * 1024 * 1024) throw new Error("Arquivo muito grande. Máximo 25MB.");
        const caminho = await enviarAudio(audioFile, clinicaId);
        const r = await analyze({
          data: {
            clinicaId,
            atendente: nome,
            audioPath: caminho,
            audioMime: audioFile.type || "audio/mpeg",
          },
        });
        setResult(r);
        await saveToHistory(r, "audio", audioFile.name, nome, atendenteSelecionada.userId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-w-0">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-card/95 px-4 py-3 backdrop-blur md:px-6">
        <h1 className="mr-auto text-base font-semibold tracking-tight">
          Coach WhatsApp {clinicaNome ? `· ${clinicaNome}` : ""}
        </h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <TopStat label="Análises" value={String(kpis.total)} />
          <TopStat label="Atendentes" value={String(kpis.pessoas)} />
          <TopStat label="Nota média" value={kpis.total ? kpis.media.toFixed(1) : "—"} />
          <TopStat label="Hoje" value={String(kpis.hoje)} />
        </div>
      </header>

      <main
        className={`grid w-full max-w-[1400px] items-start gap-5 px-4 py-6 pb-20 md:px-6 ${
          aba === "analise" ? "lg:grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-1"
        }`}
      >
        <div className="min-w-0 space-y-5">
          {/* As abas agora vivem no menu lateral (/app/coach#progresso etc.). */}
          <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>


            <TabsContent value="progresso" className="mt-5 space-y-5">
              <UsoIA clinicaId={clinicaId} />
              <CourseView
                history={history}
                clinicas={clinicas}
                clinicaId={clinicaId}
                isSuper={false}
                atendentes={atendentes.map((a) => ({ nome: a.nome, clinicaId: a.clinicaId }))}
              />
            </TabsContent>

            <TabsContent value="conversas" className="mt-5">
              <HistoricoGestor clinicaId={clinicaId} />
            </TabsContent>

            <TabsContent value="perfis" className="mt-5 space-y-5">
              <HistoricoSemUsuario clinicaId={clinicaId} onVinculado={() => void loadHistory()} />
              <ProfilesView
                history={history}
                clinicaId={clinicaId}
                selected={selectedAtendente}
                onSelect={setSelectedAtendente}
                onOpenItem={openHistoryItem}
              />
            </TabsContent>

            <TabsContent value="vozes" className="mt-5">
              <VozEditor
                value={config.vozConfig}
                onChange={(next) => {
                  void salvar({ vozConfig: next });
                }}
              />
            </TabsContent>

            <TabsContent value="analise" className="mt-5 space-y-6">
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <Tabs value={tab} onValueChange={(v) => setTab(v as "texto" | "audio")}>
                  <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight">
                        Analise um atendimento
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Cole a conversa do WhatsApp ou envie o áudio da ligação.
                      </p>
                    </div>
                    <TabsList className="bg-secondary">
                      <TabsTrigger value="texto">
                        <MessageCircle className="mr-2 h-4 w-4" /> Texto
                      </TabsTrigger>
                      <TabsTrigger value="audio">
                        <Mic className="mr-2 h-4 w-4" /> Áudio
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <div className="mb-5">
                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <User className="h-3.5 w-3.5" /> Atendente avaliada
                    </label>
                    <Select value={atendenteId} onValueChange={setAtendenteId}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Escolha a atendente" />
                      </SelectTrigger>
                      <SelectContent>
                        {atendentes.map((a) => (
                          <SelectItem key={a.userId} value={a.userId}>
                            {a.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <BaseConhecimentoEditor
                    tamanho={config.baseSistema.length}
                    geradaEm={config.baseGeradaEm}
                    complemento={config.complemento}
                    gerando={gerandoBase}
                    erro={erroBase}
                    onAtualizar={() => {
                      void atualizarBase();
                    }}
                    onComplemento={(texto) => {
                      void salvar({ complemento: texto });
                    }}
                  />

                  <ChecklistEditor
                    items={config.checklist}
                    onChange={(next) => {
                      void salvar({ checklist: next });
                    }}
                  />

                  <ScriptsEditor
                    items={config.scripts}
                    onChange={(next) => {
                      void salvar({ scripts: next });
                    }}
                  />

                  <TabsContent value="texto" className="mt-0">
                    <Textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Cole aqui a conversa do WhatsApp ou a transcrição da ligação..."
                      className="min-h-[260px] border-input bg-background font-mono text-sm"
                    />
                    <div className="mt-3 text-xs text-muted-foreground">
                      {text.length} caracteres
                    </div>
                  </TabsContent>

                  <TabsContent value="audio" className="mt-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-input px-6 py-12 transition-colors hover:bg-secondary/50"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                        <Upload className="h-6 w-6 text-primary" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium">
                          {audioFile ? audioFile.name : "Clique para enviar o áudio"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          MP3, WAV, M4A ou OGG · até 18MB
                        </p>
                      </div>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                    />
                  </TabsContent>
                </Tabs>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <Button onClick={handleAnalyze} disabled={loading} size="lg">
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analisando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" /> Analisar com IA
                      </>
                    )}
                  </Button>
                </div>

                {error && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {result && <ResultView result={result} atendente={atendente} />}
            </TabsContent>
          </Tabs>
        </div>

        {aba === "analise" && (
          <HistorySidebar
            items={history}
            onOpen={openHistoryItem}
            onDelete={deleteHistoryItem}
            onNew={() => {
              setResult(null);
              setError(null);
              setText("");
              setAudioFile(null);
            }}
          />
        )}
      </main>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  Bot,
  Clock,
  Loader2,
  Search,
  Send,
  Sparkles,
  Stethoscope,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClinica } from "@/hooks/use-clinica";
import { getContextoClinica, chatNina } from "@/lib/nina.functions";
import { VoiceInput } from "@/components/voice-input";
import { falarNina, isNinaVozOn, pararNina, setNinaVozOn } from "@/lib/nina-voz";
import { cn } from "@/lib/utils";

type Medico = {
  id: string;
  nome: string;
  crm: string | null;
  crm_uf: string | null;
  horarios: Array<{ dia: string; inicio: string; fim: string; obs: string | null }>;
};
type Procedimento = {
  id: string;
  nome: string;
  grupo: string | null;
  tipo: string;
  valor_dinheiro_pix: number;
  valor_cartao: number;
  duracao_minutos: number;
  preparo: string | null;
};

const money = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function InformacoesRapidasCard({ className }: { className?: string }) {
  const [tabela, setTabela] = useState(false);
  const [nina, setNina] = useState(false);

  return (
    <section className={cn("rounded-2xl border border-slate-100 bg-white p-4", className)}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <BookOpen className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">Informações rápidas</h2>
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            Consultar valores de exames, especialidades e horários dos médicos rapidamente.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setTabela(true)}>
          <Search className="h-4 w-4 mr-1.5" /> Abrir tabela de preços/horários
        </Button>
        <Button size="sm" variant="outline" onClick={() => setNina(true)}>
          <Bot className="h-4 w-4 mr-1.5" /> Perguntar à Nina
        </Button>
      </div>

      <TabelaRapidaDrawer open={tabela} onOpenChange={setTabela} />
      <NinaDrawer open={nina} onOpenChange={setNina} />
    </section>
  );
}

function TabelaRapidaDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { clinicaAtual } = useClinica();
  const getCtx = useServerFn(getContextoClinica);
  const [medicos, setMedicos] = useState<Medico[]>([]);
  const [procs, setProcs] = useState<Procedimento[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open || !clinicaAtual) return;
    setLoading(true);
    getCtx({ data: { clinicaId: clinicaAtual.clinica_id } })
      .then((r: any) => {
        setMedicos((r?.medicos ?? []) as Medico[]);
        setProcs((r?.procedimentos ?? []) as Procedimento[]);
      })
      .catch(() => void 0)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clinicaAtual?.clinica_id]);

  const termo = q.trim().toLowerCase();
  const procsFiltrados = useMemo(
    () =>
      !termo
        ? procs
        : procs.filter((p) => `${p.nome} ${p.grupo ?? ""} ${p.tipo}`.toLowerCase().includes(termo)),
    [procs, termo],
  );
  const medicosFiltrados = useMemo(
    () =>
      !termo
        ? medicos
        : medicos.filter(
            (m) =>
              `${m.nome} ${m.crm ?? ""}`.toLowerCase().includes(termo) ||
              m.horarios.some((h) => h.dia.toLowerCase().includes(termo)),
          ),
    [medicos, termo],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-slate-100">
          <SheetTitle>Tabela de preços e horários</SheetTitle>
          <SheetDescription>
            Consulta rápida de procedimentos, valores e agenda dos médicos.
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 py-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar exame, procedimento ou médico..."
          />
        </div>
        <Tabs defaultValue="procedimentos" className="flex-1 min-h-0 flex flex-col">
          <div className="px-5">
            <TabsList>
              <TabsTrigger value="procedimentos">Exames e valores</TabsTrigger>
              <TabsTrigger value="medicos">Médicos e horários</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            value="procedimentos"
            className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-2"
          >
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))
            ) : procsFiltrados.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                Nenhum procedimento encontrado.
              </p>
            ) : (
              procsFiltrados.slice(0, 300).map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-100 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{p.nome}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {p.grupo ?? p.tipo} · {p.duracao_minutos} min
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums text-slate-800">
                        {money(p.valor_dinheiro_pix)}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        cartão {money(p.valor_cartao)}
                      </div>
                    </div>
                  </div>
                  {p.preparo && (
                    <p className="mt-1 text-[11px] text-amber-700">Preparo: {p.preparo}</p>
                  )}
                </div>
              ))
            )}
          </TabsContent>
          <TabsContent
            value="medicos"
            className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-2"
          >
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))
            ) : medicosFiltrados.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">Nenhum médico encontrado.</p>
            ) : (
              medicosFiltrados.map((m) => (
                <div key={m.id} className="rounded-xl border border-slate-100 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-sm font-medium text-slate-800 truncate">{m.nome}</span>
                    {m.crm && (
                      <Badge variant="secondary" className="text-[10px]">
                        CRM {m.crm}
                        {m.crm_uf ? `/${m.crm_uf}` : ""}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {m.horarios.length === 0 ? (
                      <span className="text-[11px] text-slate-500">Sem horários cadastrados.</span>
                    ) : (
                      m.horarios.map((h, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-400"
                        >
                          <Clock className="h-3 w-3" /> {h.dia} {h.inicio}–{h.fim}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

type Msg = { role: "user" | "assistant"; content: string };

function NinaDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { clinicaAtual } = useClinica();
  const enviar = useServerFn(chatNina);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const perguntar = async (texto: string) => {
    const t = texto.trim();
    if (!t || loading || !clinicaAtual) return;
    const novas: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(novas);
    setInput("");
    setLoading(true);
    try {
      const r: any = await enviar({
        data: { clinicaId: clinicaAtual.clinica_id, messages: novas.slice(-20) },
      });
      setMsgs([
        ...novas,
        { role: "assistant", content: r?.reply || r?.error || "Não consegui responder agora." },
      ]);
    } catch {
      setMsgs([
        ...novas,
        { role: "assistant", content: "Não foi possível falar com a Nina agora." },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const sugestoes = [
    "Qual o valor do ultrassom?",
    "Quais médicos atendem hoje?",
    "Horários da cardiologia",
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-slate-100">
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4" /> Nina — assistente da clínica
          </SheetTitle>
          <SheetDescription>
            Pergunte sobre valores, especialidades e horários dos médicos.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
          {msgs.length === 0 && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-center">
              <Sparkles className="h-5 w-5 mx-auto text-slate-400" />
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Comece com uma pergunta rápida:
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {sugestoes.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => void perguntar(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed",
                  m.role === "user"
                    ? "rounded-2xl bg-primary px-3 py-2 text-primary-foreground"
                    : "text-slate-800 dark:text-slate-100",
                )}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Nina está pensando...
            </div>
          )}
          <div ref={fim} />
        </div>
        <form
          className="border-t border-slate-100 p-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void perguntar(input);
          }}
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite ou fale sua pergunta..."
          />
          {/* Fala com a Nina: grava o áudio, transcreve e já envia a pergunta. */}
          <VoiceInput
            append={false}
            title="Falar com a Nina"
            prompt="Transcreva a pergunta do usuário em português do Brasil, sem comentários."
            onTranscript={(t) => void perguntar(t)}
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

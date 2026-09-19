/**
 * Coach WhatsApp — telas do painel da gestora.
 * Portado do projeto original (routes/index.tsx), adaptado ao ClinicaOS:
 * tabelas com prefixo coach_, clínica vinda do contexto do sistema e
 * componentes de UI locais.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  MessageCircle,
  Mic,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  GraduationCap,
  Quote,
  Loader2,
  FileText,
  CheckCircle2,
  AlertCircle,
  History,
  ClipboardCheck,
  Trash2,
  Plus,
  User,
  TrendingUp,
  TrendingDown,
  Minus,
  Printer,
  ListChecks,
  X,
  CircleDashed,
  CalendarCheck,
  Search,
  Phone,
  ChevronDown,
  Flame,
  Award,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { MarcaClinica } from "@/components/coach/MarcaClinica";
import { PainelAcoes } from "@/components/coach/PainelAcoes";
import { GestaoDesempenho } from "@/components/coach/GestaoDesempenho";
import { EventosSeguranca } from "@/components/coach/EventosSeguranca";
import type { AnalysisResult } from "@/lib/coach/analyze.functions";
import type { ScriptItem } from "@/lib/coach/config-clinica";
import {
  proximaAtividade,
  calcularProgresso,
  diaSaoPaulo,
  regrasPadrao,
  type ProvaProgresso,
  type SessaoProgresso,
} from "@/lib/coach/treinamento-plano";
import { fetchTempoEstudo, formatDuracao, type TempoRow } from "@/lib/coach/study-time";

export type HistoryItem = {
  id: string;
  atendente: string;
  titulo: string;
  preview: string;
  tipo_entrada: "texto" | "audio";
  pontuacao: number;
  sentimento: "positivo" | "neutro" | "negativo";
  resultado: AnalysisResult;
  created_at: string;
};

export type ClinicaCoach = { id: string; nome: string };

export function TopStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
      <div className="kpi-number text-base text-foreground">{value}</div>
    </div>
  );
}

export function ResultView({ result, atendente }: { result: AnalysisResult; atendente: string }) {
  const score = Math.max(0, Math.min(10, Number(result.pontuacao) || 0));
  const scoreColor = useMemo(() => {
    if (score >= 8) return "var(--success)";
    if (score >= 5) return "oklch(0.78 0.16 85)";
    return "var(--destructive)";
  }, [score]);

  const sentimentMap = {
    positivo: { label: "Cliente satisfeito", color: "bg-success/15 text-[color:var(--success)] border-success/30" },
    neutro: { label: "Cliente neutro", color: "bg-muted text-muted-foreground border-border" },
    negativo: { label: "Cliente insatisfeito", color: "bg-destructive/10 text-destructive border-destructive/20" },
  } as const;
  const sentiment = sentimentMap[result.sentimento] ?? sentimentMap.neutro;

  return (
    <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Score header */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <ScoreRing score={score} color={scoreColor} />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={sentiment.color}>
                {sentiment.label}
              </Badge>
              <Badge variant="outline" className="border-border text-muted-foreground">
                Nota geral {score.toFixed(1)}/10
              </Badge>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Resumo do atendimento</h2>
            <p className="text-muted-foreground mt-2 leading-relaxed">{result.resumo}</p>
          </div>
        </div>
      </div>

      {result.transcricao && (
        <Section
          icon={FileText}
          title="Transcrição"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => printTranscricaoAnonima(result.transcricao!, atendente)}
            >
              <Printer className="h-4 w-4 mr-2" /> Imprimir (anônimo)
            </Button>
          }
        >
          <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/80 leading-relaxed">
            {result.transcricao}
          </pre>
        </Section>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <ListCard
          icon={ThumbsUp}
          title="Pontos positivos"
          tone="positive"
          items={result.pontos_positivos}
        />
        <ListCard
          icon={ThumbsDown}
          title="Pontos a melhorar"
          tone="negative"
          items={result.pontos_negativos}
        />
      </div>

      <Section icon={Quote} title="Trechos de destaque">
        <div className="space-y-3">
          {result.frases_destaque.map((f, i) => (
            <div
              key={i}
              className={`rounded-2xl p-4 border ${
                f.tipo === "positiva"
                  ? "bg-bubble border-success/20"
                  : "bg-destructive/5 border-destructive/20"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {f.tipo === "positiva" ? (
                  <CheckCircle2 className="h-4 w-4 text-[color:var(--success)]" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {f.tipo === "positiva" ? "Acerto" : "Falha"}
                </span>
              </div>
              <p className="italic text-foreground/90">“{f.trecho}”</p>
              <p className="text-sm text-muted-foreground mt-2">{f.motivo}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={GraduationCap} title="Plano de treinamento">
        <div className="grid md:grid-cols-2 gap-3">
          {result.treinamento.map((t, i) => (
            <div
              key={i}
              className="rounded-2xl border bg-secondary/40 p-4 hover:bg-secondary transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm shrink-0">
                  {i + 1}
                </div>
                <div>
                  <h4 className="font-semibold">{t.titulo}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{t.descricao}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {result.agendamento && <AgendamentoView data={result.agendamento} />}

      {result.atendimento_ideal && result.atendimento_ideal.length > 0 && (
        <AtendimentoIdealView items={result.atendimento_ideal} />
      )}

      {result.curiosidade_tap && <CuriosidadeTapCard data={result.curiosidade_tap} />}

      {result.checklist_resultado && result.checklist_resultado.length > 0 && (
        <ChecklistResultView items={result.checklist_resultado} />
      )}
    </div>
  );
}

function AtendimentoIdealView({
  items,
}: {
  items: NonNullable<AnalysisResult["atendimento_ideal"]>;
}) {
  return (
    <Section
      icon={Sparkles}
      title="Como poderia ter atendido"
      action={
        <Badge variant="outline" className="border-border text-muted-foreground">
          {items.length} momentos reescritos
        </Badge>
      }
    >
      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-2xl border bg-secondary/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-6 w-6 rounded-md bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">
                {i + 1}
              </span>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {it.momento}
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-[10px] uppercase tracking-wider text-destructive mb-1">
                  O que foi dito
                </p>
                <p className="text-sm text-foreground/80 italic">“{it.dito}”</p>
              </div>
              <div className="rounded-xl border border-success/30 bg-bubble p-3">
                <p className="text-[10px] uppercase tracking-wider text-[color:var(--success)] mb-1">
                  Como poderia ter dito
                </p>
                <p className="text-sm text-foreground/90">“{it.ideal}”</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{it.motivo}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ChecklistResultView({
  items,
}: {
  items: NonNullable<AnalysisResult["checklist_resultado"]>;
}) {
  return <ChecklistResultViewInner items={items} />;
}

function CuriosidadeTapCard({
  data,
}: {
  data: NonNullable<AnalysisResult["curiosidade_tap"]>;
}) {
  return (
    <Section icon={Flame} title="Curiosidade do dia">
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
        <p className="font-semibold text-primary">{data.titulo}</p>
        <p className="text-sm text-foreground/85 mt-1.5 leading-relaxed">{data.conteudo}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Por que lembrar: {data.por_que_importa}
        </p>
      </div>
    </Section>
  );
}

function ChecklistResultViewInner({
  items,
}: {
  items: NonNullable<AnalysisResult["checklist_resultado"]>;
}) {
  const cumpridos = items.filter((i) => i.status === "cumprido").length;
  const aplicaveis = items.filter((i) => i.status !== "nao_aplicavel").length;
  const pct = aplicaveis ? Math.round((cumpridos / aplicaveis) * 100) : 0;
  return (
    <Section
      icon={ListChecks}
      title="Checklist padrão"
      action={
        <Badge variant="outline" className="border-border">
          {cumpridos}/{aplicaveis} cumpridos · {pct}%
        </Badge>
      }
    >
      <ul className="space-y-2">
        {items.map((it, i) => {
          const cfg =
            it.status === "cumprido"
              ? { Icon: CheckCircle2, cls: "text-[color:var(--success)]", label: "Cumprido" }
              : it.status === "parcial"
                ? { Icon: CircleDashed, cls: "text-amber-600", label: "Parcial" }
                : it.status === "nao_aplicavel"
                  ? { Icon: Minus, cls: "text-muted-foreground", label: "N/A" }
                  : { Icon: X, cls: "text-destructive", label: "Não cumprido" };
          const Icon = cfg.Icon;
          return (
            <li key={i} className="flex gap-3 rounded-xl border bg-secondary/30 p-3">
              <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${cfg.cls}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{it.item}</p>
                  <Badge variant="outline" className={`text-[10px] ${cfg.cls}`}>
                    {cfg.label}
                  </Badge>
                </div>
                {it.evidencia && (
                  <p className="text-xs text-muted-foreground mt-1">{it.evidencia}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function AgendamentoView({
  data,
}: {
  data: NonNullable<AnalysisResult["agendamento"]>;
}) {
  const cfg =
    data.status === "agendado"
      ? { label: "Agendou", cls: "text-[color:var(--success)]", Icon: CheckCircle2 }
      : data.status === "em_negociacao"
        ? { label: "Em negociação", cls: "text-amber-600", Icon: CircleDashed }
        : data.status === "nao_aplicavel"
          ? { label: "Não aplicável", cls: "text-muted-foreground", Icon: Minus }
          : { label: "Não agendou", cls: "text-destructive", Icon: X };
  const Icon = cfg.Icon;
  return (
    <Section
      icon={CalendarCheck}
      title="Conversão em agendamento"
      action={
        <Badge variant="outline" className={`border-border ${cfg.cls}`}>
          <Icon className="h-3.5 w-3.5 mr-1 inline" />
          {cfg.label}
        </Badge>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">{data.motivo}</p>
        <div className="rounded-xl border bg-secondary/30 p-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Aderência ao script padrão
          </p>
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(100, data.aderencia_script))}%` }}
              />
            </div>
            <span className="text-sm font-semibold">
              {Math.round(data.aderencia_script)}%
            </span>
          </div>
        </div>
        {data.oportunidades_perdidas?.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
              Oportunidades perdidas de fechamento
            </p>
            <ul className="space-y-1.5">
              {data.oportunidades_perdidas.map((o, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.proxima_acao && (
          <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
            <strong className="text-primary">Próxima ação: </strong>
            {data.proxima_acao}
          </p>
        )}
      </div>
    </Section>
  );
}

export function ScriptsEditor({
  items,
  onChange,
}: {
  items: ScriptItem[];
  onChange: (next: ScriptItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const preenchidos = items.filter((s) => s.conteudo.trim()).length;

  function update(i: number, patch: Partial<ScriptItem>) {
    onChange(items.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  return (
    <div className="mb-5 rounded-2xl border bg-secondary/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <CalendarCheck className="h-4 w-4 text-primary" />
          Scripts padrão de agendamento
          <Badge variant="outline" className="text-[10px]">
            {preenchidos} {preenchidos === 1 ? "script" : "scripts"}
          </Badge>
        </span>
        <span className="text-xs text-muted-foreground">{open ? "Recolher" : "Editar"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Escreva os scripts oficiais de agendamento (abertura, apresentação de valor, oferta de
            horários, quebra de objeções, confirmação). Eles são usados na análise, no roleplay e nas
            provas para medir aderência e treinar a conversão.
          </p>
          {items.map((s, i) => (
            <div key={i} className="rounded-xl border bg-background p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={s.titulo}
                  onChange={(e) => update(i, { titulo: e.target.value.slice(0, 160) })}
                  placeholder="Ex: Quebra de objeção de preço"
                  className="bg-background"
                  maxLength={160}
                />
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover script"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Textarea
                value={s.conteudo}
                onChange={(e) => update(i, { conteudo: e.target.value.slice(0, 4000) })}
                placeholder={"Ex: \"Perfeito, {nome}! Tenho horário hoje às 15h ou amanhã às 10h. Qual fica melhor pra você?\""}
                className="min-h-[110px] bg-background text-sm"
                maxLength={4000}
              />
              <p className="text-[11px] text-muted-foreground">{s.conteudo.length}/4000</p>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange([...items, { titulo: "", conteudo: "" }])}
            disabled={items.length >= 10}
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar script
          </Button>
        </div>
      )}
    </div>
  );
}

export function ChecklistEditor({
  items,
  onChange,
}: {
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (items.length >= 30) return;
    onChange([...items, v.slice(0, 300)]);
    setDraft("");
  }

  return (
    <div className="mb-5 rounded-2xl border bg-secondary/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <ListChecks className="h-4 w-4 text-primary" />
          Checklist padrão
          <Badge variant="outline" className="text-[10px]">
            {items.length} {items.length === 1 ? "item" : "itens"}
          </Badge>
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? "Recolher" : "Editar"}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Defina os passos obrigatórios em toda ligação/mensagem. A IA vai marcar cada item
            como cumprido, parcial ou não cumprido em cada análise.
          </p>
          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-background border px-3 py-2"
                >
                  <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm flex-1">{it}</span>
                  <button
                    type="button"
                    onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Ex: Saudar o cliente pelo nome"
              maxLength={300}
              className="bg-background"
            />
            <Button type="button" onClick={add} disabled={!draft.trim() || items.length >= 30}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  return <ScoreRingImpl score={score} color={color} />;
}

function anonimizarTranscricao(texto: string, nome: string): string {
  let out = texto;
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length >= 3);
  const alvos = [nome.trim(), ...partes].filter(Boolean);
  for (const alvo of alvos) {
    const escaped = alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "Atendente");
  }
  return out;
}

function printTranscricaoAnonima(transcricao: string, nome: string) {
  if (typeof window === "undefined") return;
  const texto = anonimizarTranscricao(transcricao, nome);
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  const data = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const turns = parseConversa(texto);
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
  const bubbles = turns
    .map((t) => {
      const side = t.role === "atendente" ? "right" : "left";
      const who = t.role === "atendente" ? "Atendente" : "Paciente";
      return `<div class="row ${side}"><div class="bubble ${side}"><div class="who">${who}</div><div class="msg">${esc(t.text)}</div></div></div>`;
    })
    .join("");
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Transcrição do atendimento</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#111; max-width: 720px; margin: 32px auto; padding: 0 24px; background:#fff; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
  .chat { display:flex; flex-direction:column; gap:10px; }
  .row { display:flex; }
  .row.left { justify-content:flex-start; }
  .row.right { justify-content:flex-end; }
  .bubble { max-width: 78%; padding: 8px 12px; border-radius: 12px; font-size: 14px; line-height: 1.45; box-shadow: 0 1px 0 rgba(0,0,0,0.04); border:1px solid #e5e7eb; page-break-inside: avoid; }
  .bubble.left { background:#f3f4f6; border-top-left-radius: 4px; }
  .bubble.right { background:#dcfce7; border-top-right-radius: 4px; }
  .who { font-size: 11px; font-weight: 600; color:#555; margin-bottom: 2px; text-transform: uppercase; letter-spacing: .3px; }
  .msg { white-space: pre-wrap; }
  .footer { margin-top: 24px; color:#888; font-size: 11px; border-top:1px solid #eee; padding-top: 8px; }
  @media print { .noprint { display:none; } body { margin: 0 auto; } }
  button { padding: 8px 14px; border:1px solid #ddd; background:#f6f6f6; border-radius:6px; cursor:pointer; }
</style></head><body>
<h1>Transcrição do atendimento</h1>
<div class="meta">Documento anônimo · Gerado em ${data}</div>
<div class="chat">${bubbles}</div>
<div class="footer">Identidade da atendente omitida para fins de treinamento.</div>
<div class="noprint" style="margin-top:16px;text-align:right;"><button onclick="window.print()">Imprimir</button></div>
<script>setTimeout(()=>window.print(), 300);</script>
</body></html>`);
  w.document.close();
}

type ConversaTurn = { role: "atendente" | "paciente"; text: string };

function parseConversa(texto: string): ConversaTurn[] {
  const atendenteWords =
    /^(atendente|operador|operadora|agente|recepcionista|enfermeir[oa]?|secretári[oa]?|sac|suporte|a)$/i;
  const pacienteWords =
    /^(paciente|cliente|usuári[oa]?|chamador[a]?|interlocutor[a]?|p|c)$/i;

  const classify = (
    speaker: string,
    lastRole: ConversaTurn["role"] | null,
  ): ConversaTurn["role"] => {
    const s = speaker.trim().toLowerCase();
    if (atendenteWords.test(s)) return "atendente";
    if (pacienteWords.test(s)) return "paciente";
    return lastRole === "atendente" ? "paciente" : "atendente";
  };

  // Normaliza: remove timestamps tipo [00:12] ou (00:12) soltos
  const limpo = texto.replace(/[\[\(]\d{1,2}:\d{2}(?::\d{2})?[\]\)]/g, " ");

  // 1) Tenta achar marcadores de fala em qualquer ponto do texto.
  //    Aceita: "Atendente:", "- Atendente:", "Atendente —", "Atendente -"
  const reSpeakerGlobal =
    /(^|\n|\s|[—\-•])\s*([\p{L}][\p{L}.\s]{0,30}?)\s*[:：]\s+/gu;

  const matches: { idx: number; end: number; speaker: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = reSpeakerGlobal.exec(limpo)) !== null) {
    const speaker = m[2].trim();
    // Só considera se for um rótulo de fala plausível (curto, sem ponto final)
    if (speaker.split(/\s+/).length > 3) continue;
    if (!/^[\p{L}]/u.test(speaker)) continue;
    matches.push({ idx: m.index + m[1].length, end: m.index + m[0].length, speaker });
  }

  if (matches.length >= 2) {
    const turns: ConversaTurn[] = [];
    // Texto antes do primeiro marcador, se existir, vira fala da contraparte do primeiro
    const firstRole = classify(matches[0].speaker, null);
    const pre = limpo.slice(0, matches[0].idx).trim();
    if (pre.length > 0) {
      turns.push({ role: firstRole === "atendente" ? "paciente" : "atendente", text: pre });
    }
    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i];
      const next = matches[i + 1];
      const role = classify(cur.speaker, turns.length ? turns[turns.length - 1].role : null);
      const text = limpo.slice(cur.end, next ? next.idx : limpo.length).trim();
      if (text) turns.push({ role, text });
    }
    return turns.filter((t) => t.text.length > 0);
  }

  // 2) Fallback: nenhum marcador encontrado. Divide por sentenças e alterna falantes.
  const sentences = limpo
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ý"“\-])/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return [];
  return sentences.map((s, i) => ({
    role: i % 2 === 0 ? "atendente" : "paciente",
    text: s,
  }));
}

export function ProfilesView({
  history,
  selected,
  onSelect,
  onOpenItem,
}: {
  history: HistoryItem[];
  selected: string | null;
  onSelect: (n: string | null) => void;
  onOpenItem: (item: HistoryItem) => void;
}) {
  const profiles = useMemo(() => {
    const map = new Map<string, HistoryItem[]>();
    for (const h of history) {
      const arr = map.get(h.atendente) ?? [];
      arr.push(h);
      map.set(h.atendente, arr);
    }
    return Array.from(map.entries())
      .map(([nome, items]) => {
        const sorted = [...items].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
        const scores = sorted.map((i) => Number(i.pontuacao) || 0);
        const media = scores.reduce((s, n) => s + n, 0) / scores.length;
        const first = scores[0];
        const last = scores[scores.length - 1];
        const delta = last - first;
        return { nome, items: sorted, media, delta, total: items.length, last };
      })
      .sort((a, b) => b.media - a.media);
  }, [history]);

  if (profiles.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center shadow-sm">
        <User className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold text-lg">Nenhuma atendente cadastrada ainda</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Faça sua primeira análise informando o nome da atendente para começar a montar o perfil.
        </p>
      </div>
    );
  }

  const sel = selected ? profiles.find((p) => p.nome === selected) : null;

  if (sel) {
    return <ProfileDetail profile={sel} onBack={() => onSelect(null)} onOpenItem={onOpenItem} />;
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="text-2xl font-semibold tracking-tight mb-1">Perfis das atendentes</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Acompanhe a média de qualidade e a evolução de cada pessoa da equipe.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        {profiles.map((p) => {
          const cor =
            p.media >= 8
              ? "var(--success)"
              : p.media >= 5
                ? "oklch(0.78 0.16 85)"
                : "var(--destructive)";
          const trendIcon =
            p.delta > 0.3 ? TrendingUp : p.delta < -0.3 ? TrendingDown : Minus;
          const TrendIcon = trendIcon;
          const trendCls =
            p.delta > 0.3
              ? "text-[color:var(--success)]"
              : p.delta < -0.3
                ? "text-destructive"
                : "text-muted-foreground";
          return (
            <button
              key={p.nome}
              type="button"
              onClick={() => onSelect(p.nome)}
              className="text-left rounded-2xl border bg-secondary/30 hover:bg-secondary p-5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  {p.nome.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{p.nome}</h3>
                  <p className="text-xs text-muted-foreground">
                    {p.total} {p.total === 1 ? "análise" : "análises"}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold" style={{ color: cor }}>
                    {p.media.toFixed(1)}
                  </div>
                  <div className={`text-[11px] flex items-center gap-1 justify-end ${trendCls}`}>
                    <TrendIcon className="h-3 w-3" />
                    {p.delta >= 0 ? "+" : ""}
                    {p.delta.toFixed(1)}
                  </div>
                </div>
              </div>
              <Sparkline scores={p.items.map((i) => Number(i.pontuacao) || 0)} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) {
    return (
      <div className="mt-4 h-12 flex items-end gap-1">
        {scores.map((s, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-primary/40"
            style={{ height: `${(s / 10) * 100}%` }}
          />
        ))}
      </div>
    );
  }
  const w = 200;
  const h = 48;
  const step = w / (scores.length - 1);
  const pts = scores
    .map((s, i) => `${i * step},${h - (s / 10) * h}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full h-12">
      <polyline
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

function ProfileDetail({
  profile,
  onBack,
  onOpenItem,
}: {
  profile: {
    nome: string;
    items: HistoryItem[];
    media: number;
    delta: number;
    total: number;
    last: number;
  };
  onBack: () => void;
  onOpenItem: (item: HistoryItem) => void;
}) {
  const allPos = profile.items.flatMap((i) => i.resultado.pontos_positivos ?? []);
  const allNeg = profile.items.flatMap((i) => i.resultado.pontos_negativos ?? []);
  const topPos = topRecurring(allPos);
  const topNeg = topRecurring(allNeg);
  const sentimentos = profile.items.reduce(
    (acc, i) => {
      acc[i.sentimento] = (acc[i.sentimento] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const cor =
    profile.media >= 8
      ? "var(--success)"
      : profile.media >= 5
        ? "oklch(0.78 0.16 85)"
        : "var(--destructive)";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-primary hover:text-primary-deep mb-4"
        >
          ← Voltar para perfis
        </button>
        <div className="flex justify-end -mt-8 mb-2">
          <Link
            to="/app/coach/prova/$nome"
            params={{ nome: encodeURIComponent(profile.nome) }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/40 text-primary px-4 py-2 text-sm font-medium hover:bg-primary/10 transition-colors mr-2"
          >
            <ClipboardCheck className="h-4 w-4" />
            Gerar prova
          </Link>
          <Link
            to="/app/coach/roleplay/$nome"
            params={{ nome: encodeURIComponent(profile.nome) }}
            className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shadow-sm hover:bg-primary-deep transition-colors"
          >
            <GraduationCap className="h-4 w-4" />
            Iniciar treinamento (roleplay)
          </Link>
        </div>
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div
            className="h-20 w-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shrink-0"
            style={{ background: "var(--gradient-hero)" }}
          >
            {profile.nome.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-semibold tracking-tight">{profile.nome}</h2>
            <p className="text-sm text-muted-foreground">
              {profile.total} {profile.total === 1 ? "atendimento avaliado" : "atendimentos avaliados"}
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Stat label="Média" value={profile.media.toFixed(1)} color={cor} />
              <Stat
                label="Última nota"
                value={profile.last.toFixed(1)}
              />
              <Stat
                label="Evolução"
                value={`${profile.delta >= 0 ? "+" : ""}${profile.delta.toFixed(1)}`}
                color={
                  profile.delta > 0.3
                    ? "var(--success)"
                    : profile.delta < -0.3
                      ? "var(--destructive)"
                      : undefined
                }
              />
              <Stat label="😊" value={String(sentimentos.positivo ?? 0)} />
              <Stat label="😐" value={String(sentimentos.neutro ?? 0)} />
              <Stat label="☹️" value={String(sentimentos.negativo ?? 0)} />
            </div>
          </div>
        </div>
        <div className="mt-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Evolução das notas
          </p>
          <EvolutionChart items={profile.items} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Section icon={ThumbsUp} title="Pontos fortes recorrentes">
          {topPos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem padrões ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {topPos.map((p) => (
                <li key={p.text} className="flex gap-2">
                  <span className="h-1.5 w-1.5 mt-1.5 rounded-full bg-[color:var(--success)] shrink-0" />
                  <span className="flex-1">{p.text}</span>
                  <Badge variant="outline" className="text-[10px]">×{p.count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section icon={ThumbsDown} title="Pontos a desenvolver">
          {topNeg.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem padrões ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {topNeg.map((p) => (
                <li key={p.text} className="flex gap-2">
                  <span className="h-1.5 w-1.5 mt-1.5 rounded-full bg-destructive shrink-0" />
                  <span className="flex-1">{p.text}</span>
                  <Badge variant="outline" className="text-[10px]">×{p.count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section icon={History} title="Histórico de atendimentos">
        <ul className="divide-y">
          {[...profile.items].reverse().map((it) => {
            const s = Number(it.pontuacao) || 0;
            const scoreCls =
              s >= 8
                ? "bg-success/15 text-[color:var(--success)]"
                : s >= 5
                  ? "bg-amber-100 text-amber-700"
                  : "bg-destructive/10 text-destructive";
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => onOpenItem(it)}
                  className="w-full text-left py-3 flex items-center gap-3 hover:bg-secondary/40 rounded-lg px-2 transition-colors"
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${scoreCls}`}>
                    {s.toFixed(1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{it.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(it.created_at).toLocaleDateString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <RoleplayHistorySection atendente={profile.nome} />
      <ProvaHistorySection atendente={profile.nome} />
    </div>
  );
}

type ProvaRow = {
  id: string;
  nota: number;
  acertos: number;
  total: number;
  created_at: string;
  questoes?: {
    pergunta: string;
    alternativas: string[];
    correta: number;
    explicacao?: string;
  }[] | null;
  respostas?: number[] | null;
};

function ProvaHistorySection({ atendente }: { atendente: string }) {
  const [rows, setRows] = useState<ProvaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("coach_provas")
      .select("id,nota,acertos,total,created_at,questoes,respostas")
      .eq("atendente", atendente)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data ?? []) as unknown as ProvaRow[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [atendente]);

  const scores = [...rows].reverse().map((r) => Number(r.nota) || 0);
  const media = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0;
  const last = scores[scores.length - 1] ?? 0;
  const delta = scores.length > 1 ? last - (scores[0] ?? 0) : 0;

  return (
    <Section icon={ClipboardCheck} title="Histórico de provas">
      {loading ? (
        <div className="py-6 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma prova aplicada ainda. Use “Gerar prova” para criar questões a partir das
          avaliações desta atendente.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Média" value={media.toFixed(1)} />
            <Stat label="Última" value={last.toFixed(1)} />
            <Stat
              label="Evolução"
              value={`${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
              color={
                delta > 0.3 ? "var(--success)" : delta < -0.3 ? "var(--destructive)" : undefined
              }
            />
          </div>
          {scores.length > 0 && <RoleplaySparkline scores={scores} />}
          <ul className="divide-y mt-4">
            {rows.map((r) => {
              const s = Number(r.nota) || 0;
              const cls =
                s >= 8
                  ? "bg-success/15 text-[color:var(--success)]"
                  : s >= 5
                    ? "bg-amber-100 text-amber-700"
                    : "bg-destructive/10 text-destructive";
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === r.id ? null : r.id)}
                    className="w-full text-left py-3 flex items-center gap-3 hover:bg-secondary/40 rounded-lg px-2 transition-colors"
                  >
                    <div
                      className={`h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${cls}`}
                    >
                      {s.toFixed(1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {r.acertos} de {r.total} questões corretas
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </button>
                  {openId === r.id && (
                    <div className="px-2 pb-4 space-y-3">
                      {(r.questoes ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Esta prova foi registrada sem o detalhe das questões.
                        </p>
                      ) : (
                        (r.questoes ?? []).map((q, i) => {
                          const marcada = (r.respostas ?? [])[i] ?? -1;
                          const ok = marcada === q.correta;
                          return (
                            <div key={i} className="rounded-2xl border bg-secondary/30 p-3 text-sm">
                              <div className="flex items-start gap-2">
                                <span
                                  className={`text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 ${
                                    ok
                                      ? "bg-success/15 text-[color:var(--success)]"
                                      : "bg-destructive/10 text-destructive"
                                  }`}
                                >
                                  {ok ? "Acertou" : "Errou"}
                                </span>
                                <p className="font-medium">
                                  {i + 1}. {q.pergunta}
                                </p>
                              </div>
                              <ul className="mt-2 space-y-1">
                                {(q.alternativas ?? []).map((alt, ai) => (
                                  <li
                                    key={ai}
                                    className={`rounded-lg px-2 py-1 ${
                                      ai === q.correta
                                        ? "bg-success/10 text-[color:var(--success)] font-medium"
                                        : ai === marcada
                                          ? "bg-destructive/10 text-destructive"
                                          : "text-muted-foreground"
                                    }`}
                                  >
                                    {alt}
                                    {ai === marcada && (
                                      <span className="ml-1 text-[10px] uppercase tracking-wider">
                                        (resposta dela)
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                              {q.explicacao && (
                                <p className="mt-2 text-xs text-muted-foreground">{q.explicacao}</p>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Section>
  );
}

function topRecurring(items: string[]) {
  const map = new Map<string, number>();
  for (const it of items) {
    const key = it.toLowerCase().slice(0, 60);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const repr = new Map<string, string>();
  for (const it of items) {
    const key = it.toLowerCase().slice(0, 60);
    if (!repr.has(key)) repr.set(key, it);
  }
  return Array.from(map.entries())
    .map(([k, count]) => ({ text: repr.get(k)!, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

type RoleplaySessionRow = {
  id: string;
  nota: number;
  resumo: string;
  acertos: string[];
  melhorias: string[];
  dica_pratica: string | null;
  cenario: string | null;
  duracao_seg: number | null;
  created_at: string;
  perfil_cliente?: string | null;
  modo?: string | null;
  mensagens?: { role: "cliente" | "atendente"; content: string }[] | null;
};

function RoleplayHistorySection({ atendente }: { atendente: string }) {
  const [rows, setRows] = useState<RoleplaySessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("coach_roleplay_sessions")
      .select(
        "id,nota,resumo,acertos,melhorias,dica_pratica,cenario,perfil_cliente,modo,mensagens,duracao_seg,created_at",
      )
      .eq("atendente", atendente)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data ?? []) as unknown as RoleplaySessionRow[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [atendente]);

  const chronological = useMemo(() => [...rows].reverse(), [rows]);
  const scores = chronological.map((r) => Number(r.nota) || 0);
  const media = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0;
  const first = scores[0] ?? 0;
  const last = scores[scores.length - 1] ?? 0;
  const delta = scores.length > 1 ? last - first : 0;

  return (
    <Section
      icon={GraduationCap}
      title="Histórico de treinamentos (roleplay)"
      action={
        rows.length > 0 ? (
          <div className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "sessão" : "sessões"}
          </div>
        ) : null
      }
    >
      {loading ? (
        <div className="py-6 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum treinamento por simulação registrado ainda. Encerre uma sessão de roleplay para
          começar a acompanhar a evolução aqui.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Média" value={media.toFixed(1)} />
            <Stat label="Última" value={last.toFixed(1)} />
            <Stat
              label="Evolução"
              value={`${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`}
              color={
                delta > 0.3
                  ? "var(--success)"
                  : delta < -0.3
                    ? "var(--destructive)"
                    : undefined
              }
            />
          </div>
          {scores.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Evolução das notas (roleplay)
              </p>
              <RoleplaySparkline scores={scores} />
            </div>
          )}
          <ul className="divide-y">
            {rows.map((r) => {
              const s = Number(r.nota) || 0;
              const cls =
                s >= 8
                  ? "bg-success/15 text-[color:var(--success)]"
                  : s >= 5
                    ? "bg-amber-100 text-amber-700"
                    : "bg-destructive/10 text-destructive";
              const open = openId === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : r.id)}
                    className="w-full text-left py-3 flex items-center gap-3 hover:bg-secondary/40 rounded-lg px-2 transition-colors"
                  >
                    <div
                      className={`h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${cls}`}
                    >
                      {s.toFixed(1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{r.resumo}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {r.duracao_seg
                          ? ` · ${Math.floor(r.duracao_seg / 60)}:${String(r.duracao_seg % 60).padStart(2, "0")}`
                          : ""}
                        {` · ${(r.modo ?? "voz") === "texto" ? "WhatsApp (texto)" : "Ligação (voz)"}`}
                      </p>
                    </div>
                  </button>
                  {open && (
                    <div className="px-2 pb-4 space-y-3 text-sm">
                      {r.cenario && (
                        <div className="rounded-lg bg-secondary/40 p-3">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                            Cenário
                          </div>
                          <p>{r.cenario}</p>
                        </div>
                      )}
                      {(r.acertos ?? []).length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-[color:var(--success)] mb-1.5 flex items-center gap-1.5">
                            <ThumbsUp className="h-3.5 w-3.5" /> Acertos
                          </div>
                          <ul className="space-y-1">
                            {r.acertos.map((a, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="h-1.5 w-1.5 mt-1.5 rounded-full bg-[color:var(--success)] shrink-0" />
                                <span>{a}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(r.melhorias ?? []).length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-destructive mb-1.5 flex items-center gap-1.5">
                            <ThumbsDown className="h-3.5 w-3.5" /> Melhorias
                          </div>
                          <ul className="space-y-1">
                            {r.melhorias.map((a, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="h-1.5 w-1.5 mt-1.5 rounded-full bg-destructive shrink-0" />
                                <span>{a}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {r.dica_pratica && (
                        <div className="rounded-lg bg-primary/5 border border-primary/15 p-3">
                          <div className="text-[10px] uppercase tracking-wider text-primary mb-1">
                            Dica prática
                          </div>
                          <p>{r.dica_pratica}</p>
                        </div>
                      )}
                      {(r.mensagens ?? []).length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                            Conversa completa do treinamento
                          </div>
                          <div className="rounded-2xl border bg-secondary/30 p-3 space-y-1.5 max-h-80 overflow-y-auto">
                            {(r.mensagens ?? []).map((m, i) => (
                              <div
                                key={i}
                                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                                  m.role === "atendente"
                                    ? "ml-auto rounded-tr-sm bg-primary/15"
                                    : "rounded-tl-sm bg-card border"
                                }`}
                              >
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                                  {m.role === "atendente" ? "Atendente" : "Cliente (IA)"}
                                </div>
                                <p className="whitespace-pre-wrap">{m.content}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Section>
  );
}

function RoleplaySparkline({ scores }: { scores: number[] }) {
  if (scores.length === 0) return null;
  const w = 600;
  const h = 80;
  const pad = 8;
  const step = scores.length > 1 ? (w - pad * 2) / (scores.length - 1) : 0;
  const yFor = (s: number) => h - pad - (s / 10) * (h - pad * 2);
  const pts = scores.map((s, i) => `${pad + i * step},${yFor(s)}`).join(" ");
  return (
    <div className="rounded-2xl border bg-secondary/30 p-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20">
        {[0, 5, 10].map((g) => (
          <line
            key={g}
            x1={pad}
            x2={w - pad}
            y1={yFor(g)}
            y2={yFor(g)}
            stroke="oklch(0.92 0.01 160)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ))}
        {scores.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={pts}
          />
        )}
        {scores.map((s, i) => (
          <circle key={i} cx={pad + i * step} cy={yFor(s)} r="3.5" fill="var(--primary)" />
        ))}
      </svg>
    </div>
  );
}

export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5 min-w-[80px] shadow-[var(--shadow-soft)]">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="kpi-number text-xl mt-1" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

/** Selo de situação da atendente: verde = ok, âmbar = atenção, cinza = parada. */
function StatusAluno({
  completo,
  ativaHoje,
  progresso,
}: {
  completo: boolean;
  ativaHoje: boolean;
  progresso: number;
}) {
  const estilo = completo
    ? "bg-success/15 text-success"
    : ativaHoje
      ? "bg-info/15 text-info"
      : progresso > 0
        ? "bg-warning/20 text-warning"
        : "bg-muted text-muted-foreground";
  const texto = completo
    ? "Concluída"
    : ativaHoje
      ? "Estudando hoje"
      : progresso > 0
        ? "Sem estudo hoje"
        : "Não começou";
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${estilo}`}
    >
      {texto}
    </span>
  );
}


function EvolutionChart({ items }: { items: HistoryItem[] }) {
  const scores = items.map((i) => Number(i.pontuacao) || 0);
  if (scores.length === 0) return null;
  const w = 600;
  const h = 120;
  const pad = 8;
  const step = scores.length > 1 ? (w - pad * 2) / (scores.length - 1) : 0;
  const yFor = (s: number) => h - pad - (s / 10) * (h - pad * 2);
  const pts = scores.map((s, i) => `${pad + i * step},${yFor(s)}`).join(" ");
  const area = `${pad},${h - pad} ${pts} ${pad + (scores.length - 1) * step},${h - pad}`;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Evolução das notas</span>
        <span className="inline-flex items-center gap-1">
          <span className="h-0.5 w-4 bg-warning" /> meta 6,0
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32" preserveAspectRatio="none">
        {[0, 5, 10].map((g) => (
          <line
            key={g}
            x1={pad}
            x2={w - pad}
            y1={yFor(g)}
            y2={yFor(g)}
            stroke="var(--grid-line)"
            strokeWidth="1"
          />
        ))}
        {/* Faixa de meta mínima */}
        <line
          x1={pad}
          x2={w - pad}
          y1={yFor(6)}
          y2={yFor(6)}
          stroke="var(--warning)"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
        {scores.length > 1 && (
          <polygon points={area} fill="var(--primary)" opacity="0.1" />
        )}
        {scores.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={pts}
          />
        )}
        {scores.map((s, i) => (
          <circle
            key={i}
            cx={pad + i * step}
            cy={yFor(s)}
            r="3.5"
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth="2"
          />
        ))}
      </svg>
    </div>
  );
}

function ScoreRingImpl({ score, color }: { score: number; color: string }) {
  const pct = (score / 10) * 100;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} ${pct}%, oklch(0.92 0.01 160) 0)`,
        }}
      />
      <div className="absolute inset-2 rounded-full bg-card flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>
          {score.toFixed(1)}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">nota</span>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: typeof FileText;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-bubble flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary-deep" />
          </div>
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ListCard({
  icon: Icon,
  title,
  items,
  tone,
}: {
  icon: typeof ThumbsUp;
  title: string;
  items: string[];
  tone: "positive" | "negative";
}) {
  const isPos = tone === "positive";
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div
          className={`h-8 w-8 rounded-lg flex items-center justify-center ${
            isPos ? "bg-bubble" : "bg-destructive/10"
          }`}
        >
          <Icon
            className={`h-4 w-4 ${isPos ? "text-primary-deep" : "text-destructive"}`}
          />
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <ul className="space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span
              className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                isPos ? "bg-[color:var(--success)]" : "bg-destructive"
              }`}
            />
            <span className="text-foreground/90 leading-relaxed">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HistorySidebar({
  items,
  onOpen,
  onDelete,
  onNew,
}: {
  items: HistoryItem[];
  onOpen: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <aside className="rounded-xl border bg-card shadow-sm lg:sticky lg:top-4 overflow-hidden">
      <div className="p-5 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-bubble flex items-center justify-center">
            <History className="h-4 w-4 text-primary-deep" />
          </div>
          <div>
            <h3 className="font-semibold leading-tight">Histórico</h3>
            <p className="text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? "análise" : "análises"}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onNew}
          className="text-primary hover:text-primary-deep hover:bg-bubble"
        >
          <Plus className="h-4 w-4 mr-1" /> Nova
        </Button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Suas análises aparecerão aqui.
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((it) => {
              const score = Number(it.pontuacao) || 0;
              const scoreCls =
                score >= 8
                  ? "bg-success/15 text-[color:var(--success)]"
                  : score >= 5
                    ? "bg-amber-100 text-amber-700"
                    : "bg-destructive/10 text-destructive";
              return (
                <li key={it.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpen(it)}
                    className="w-full text-left p-4 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${scoreCls}`}
                      >
                        {score.toFixed(1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                          {it.tipo_entrada === "audio" ? (
                            <Mic className="h-3 w-3" />
                          ) : (
                            <MessageCircle className="h-3 w-3" />
                          )}
                          <span>{it.tipo_entrada}</span>
                          <span>·</span>
                          <span>
                            {new Date(it.created_at).toLocaleDateString("pt-BR", {
                              timeZone: "America/Sao_Paulo",
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-primary-deep font-medium mb-0.5">
                          <User className="h-3 w-3" />
                          <span className="truncate">{it.atendente}</span>
                        </div>
                        <p className="font-medium text-sm leading-snug line-clamp-2">
                          {it.titulo}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {it.preview}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Excluir análise"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(it.id);
                    }}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

/* ---------------- Curso & Progresso ---------------- */

type ProgressoRow = {
  atendente: string;
  nota: number;
  created_at: string;
  clinica_id?: string | null;
};
type RoleplayProgressoRow = ProgressoRow & { modo?: string | null };
type CourseFiltro = "todas" | "andamento" | "concluidas" | "inativas";

const SEM_CLINICA = "__sem_clinica__";

export function CourseView({
  history,
  clinicas,
  clinicaId,
  isSuper,
  atendentes,
}: {
  history: HistoryItem[];
  clinicas: ClinicaCoach[];
  clinicaId: string | null;
  isSuper: boolean;
  /** Atendentes da clínica (usuários com o módulo Coach). */
  atendentes: { nome: string; clinicaId: string | null }[];
}) {
  const [tempos, setTempos] = useState<TempoRow[]>([]);
  const [provas, setProvas] = useState<ProgressoRow[]>([]);
  const [roleplays, setRoleplays] = useState<RoleplayProgressoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<CourseFiltro>("todas");
  const [clinicaFiltro, setClinicaFiltro] = useState<string>(isSuper ? "todas" : (clinicaId ?? "todas"));

  useEffect(() => {
    if (!isSuper) setClinicaFiltro(clinicaId ?? "todas");
  }, [isSuper, clinicaId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [t, p, r] = await Promise.all([
        fetchTempoEstudo(clinicaId),
        supabase
          .from("coach_provas")
          .select("atendente,nota,created_at,clinica_id,simulacao_gestor")
          .eq("clinica_id", clinicaId ?? "")
          .eq("simulacao_gestor", false)
          .limit(1000),
        supabase
          .from("coach_roleplay_sessions")
          .select("atendente,nota,created_at,modo,clinica_id,simulacao_gestor")
          .eq("clinica_id", clinicaId ?? "")
          .eq("simulacao_gestor", false)
          .limit(1000),
      ]);
      if (cancelled) return;
      setTempos(t);
      setProvas((p.data ?? []) as unknown as ProgressoRow[]);
      setRoleplays((r.data ?? []) as unknown as RoleplayProgressoRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicaId]);

  const hoje = diaSaoPaulo();

  /** Clínica de cada atendente: vínculo de acesso primeiro, depois os registros de atividade. */
  const clinicaPorAtendente = useMemo(() => {
    const mapa = new Map<string, string>();
    const set = (nome: string | null | undefined, id: string | null | undefined) => {
      const n = (nome ?? "").trim();
      if (!n || !id || mapa.has(n)) return;
      mapa.set(n, id);
    };
    atendentes.forEach((v) => set(v.nome, v.clinicaId));
    tempos.forEach((t) => set(t.atendente, t.clinica_id));
    roleplays.forEach((r) => set(r.atendente, r.clinica_id));
    provas.forEach((p) => set(p.atendente, p.clinica_id));
    return mapa;
  }, [atendentes, tempos, roleplays, provas]);

  const alunos = useMemo(() => {
    const nomes = new Set<string>();
    atendentes.forEach((a) => nomes.add(a.nome));
    history.forEach((h) => nomes.add(h.atendente));
    tempos.forEach((t) => nomes.add(t.atendente));
    provas.forEach((p) => nomes.add(p.atendente));
    roleplays.forEach((r) => nomes.add(r.atendente));

    return Array.from(nomes)
      .map((nome) => {
        const t = tempos.filter((x) => x.atendente === nome);
        const analises = history.filter((h) => h.atendente === nome);
        const pv = provas.filter((p) => p.atendente === nome);
        const rp = roleplays.filter((r) => r.atendente === nome);
        // Mesma conta da tela da atendente (`calcularProgresso`): antes a
        // gestora via 5/5 e a atendente 3/5, porque aqui nada exigia nota
        // mínima e lá sim.
        const prog = calcularProgresso(
          rp as unknown as SessaoProgresso[],
          pv as unknown as ProvaProgresso[],
          t,
          regrasPadrao(hoje),
        );
        const segundosTotal = prog.totais.segundos;
        const segundosHoje = prog.hoje.segundos;
        const dias = prog.totais.dias;
        const conversas = prog.trilha.whatsapp;
        const ligacoes = prog.trilha.ligacoes;
        const progresso = prog.trilha.percentual;
        const ultimo = [...t.map((x) => x.dia)].sort().pop() ?? null;
        return {
          nome,
          clinicaId: clinicaPorAtendente.get(nome) ?? null,
          segundosTotal,
          segundosHoje,
          dias,
          analises: analises.length,
          provas: pv.length,
          mediaProva: prog.totais.mediaProva,
          roleplays: rp.length,
          mediaRoleplay: prog.totais.mediaRoleplay,
          conversas,
          ligacoes,
          ultimo,
          fase: proximaAtividade(ligacoes, conversas),
          progresso,
        };
      })
      .sort((a, b) => b.progresso - a.progresso || b.segundosTotal - a.segundosTotal);
  }, [history, tempos, provas, roleplays, hoje, clinicaPorAtendente, atendentes]);

  const tempoEquipe = alunos.reduce((s, a) => s + a.segundosTotal, 0);
  const tempoHojeEquipe = alunos.reduce((s, a) => s + a.segundosHoje, 0);
  const concluidas = alunos.filter((a) => a.progresso === 100).length;
  const mediaProgresso = alunos.length
    ? Math.round(alunos.reduce((s, a) => s + a.progresso, 0) / alunos.length)
    : 0;

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return alunos.filter((a) => {
      if (q && !a.nome.toLowerCase().includes(q)) return false;
      if (clinicaFiltro !== "todas") {
        const alvo = clinicaFiltro === SEM_CLINICA ? null : clinicaFiltro;
        if ((a.clinicaId ?? null) !== alvo) return false;
      }
      if (filtro === "concluidas") return a.progresso === 100;
      if (filtro === "andamento") return a.progresso > 0 && a.progresso < 100;
      if (filtro === "inativas") return a.segundosHoje === 0;
      return true;
    });
  }, [alunos, busca, filtro, clinicaFiltro]);

  /** Atendentes agrupadas por clínica, na ordem das clínicas cadastradas. */
  const grupos = useMemo(() => {
    const nomeDe = new Map(clinicas.map((c) => [c.id, c.nome]));
    const ordem = [...clinicas.map((c) => c.id), SEM_CLINICA];
    const buckets = new Map<string, typeof visiveis>();
    visiveis.forEach((a) => {
      const key = a.clinicaId && nomeDe.has(a.clinicaId) ? a.clinicaId : SEM_CLINICA;
      const arr = buckets.get(key) ?? [];
      arr.push(a);
      buckets.set(key, arr);
    });
    return ordem
      .filter((id) => (buckets.get(id)?.length ?? 0) > 0)
      .map((id) => ({
        id,
        nome: id === SEM_CLINICA ? "Sem clínica vinculada" : (nomeDe.get(id) ?? "Clínica"),
        alunos: buckets.get(id) ?? [],
      }));
  }, [visiveis, clinicas]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-28 rounded-xl" />
        <div className="rounded-xl border bg-card p-4 md:p-5 shadow-sm space-y-2">
          <Skeleton className="h-10 rounded-lg" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (alunos.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center shadow-sm">
        <BookOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold text-lg">O curso ainda não começou</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Informe o nome da atendente e faça a primeira análise: o tempo de plataforma e as
          atividades passam a ser registrados automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Tempo total da equipe" value={formatDuracao(tempoEquipe)} />
        <Stat label="Tempo hoje" value={formatDuracao(tempoHojeEquipe)} />
        <Stat label="Atendentes" value={String(alunos.length)} />
        <Stat label="Trilhas concluídas" value={`${concluidas}/${alunos.length}`} />
        <Stat label="Progresso médio" value={`${mediaProgresso}%`} />
      </div>

      <PainelAcoes
        alunos={visiveis.map((a) => ({
          nome: a.nome,
          clinicaId: a.clinicaId,
          segundosTotal: a.segundosTotal,
          dias: a.dias,
          progresso: a.progresso,
          mediaProva: a.mediaProva,
          mediaRoleplay: a.mediaRoleplay,
          provas: a.provas,
          roleplays: a.roleplays,
          ultimo: a.ultimo,
        }))}
        clinicas={clinicas.map((c) => ({ id: c.id, nome: c.nome }))}
      />

      <GestaoDesempenho
        alunos={visiveis.map((a) => ({
          nome: a.nome,
          clinicaId: a.clinicaId,
          segundosTotal: a.segundosTotal,
          dias: a.dias,
          progresso: a.progresso,
          mediaProva: a.mediaProva,
          mediaRoleplay: a.mediaRoleplay,
          provas: a.provas,
          roleplays: a.roleplays,
          conversas: a.conversas,
          ligacoes: a.ligacoes,
          ultimo: a.ultimo,
        }))}
        clinicas={clinicas.map((c) => ({ id: c.id, nome: c.nome }))}
        podeEditar
      />

      <EventosSeguranca clinicaId={clinicaFiltro === "todas" ? null : clinicaFiltro} />






      <div className="rounded-xl border bg-card p-4 md:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-0">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar atendente…"
              className="h-10 pl-9"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(
              [
                ["todas", "Todas"],
                ["andamento", "Em andamento"],
                ["concluidas", "Concluídas"],
                ["inativas", "Sem estudo hoje"],
              ] as [CourseFiltro, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFiltro(key)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                  filtro === key
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {isSuper && clinicas.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto border-t pt-3 mb-4">
            <span className="text-xs text-muted-foreground shrink-0 mr-1">Clínica:</span>
            {([["todas", "Todas as clínicas"]] as [string, string][])
              .concat(clinicas.map((c) => [c.id, c.nome] as [string, string]))
              .map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setClinicaFiltro(key)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                    clinicaFiltro === key
                      ? "bg-primary text-primary-foreground border-transparent"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
          </div>
        )}

        {visiveis.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma atendente neste filtro.
          </p>
        )}

        {grupos.map((g) => (
        <div key={g.id} className="mb-6 last:mb-0">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="font-display text-sm font-semibold tracking-tight flex items-center gap-2">
            <MarcaClinica nome={g.nome} className="h-6 w-6 rounded-md text-[10px]" />
            {g.nome}
          </h3>
          <span className="text-xs text-muted-foreground">
            {g.alunos.length} {g.alunos.length === 1 ? "atendente" : "atendentes"} ·{" "}
            {formatDuracao(g.alunos.reduce((s, x) => s + x.segundosTotal, 0))}
          </span>
        </div>
        {/* Cabeçalho de colunas, no espírito de uma tabela de gestão */}
        <div className="hidden md:flex items-center gap-3 px-4 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="w-9 shrink-0" />
          <span className="flex-1">Atendente / fase</span>
          <span className="w-16 shrink-0">Conversas</span>
          <span className="w-16 shrink-0">Ligações</span>
          <span className="w-14 shrink-0">Provas</span>
          <span className="w-14 shrink-0">Dias</span>
          <span className="w-28 shrink-0">Progresso</span>
          <span className="w-4 shrink-0" />
        </div>
        <ul className="divide-y rounded-xl border overflow-hidden bg-card">
        {g.alunos.map((a) => {
          const completo = a.progresso === 100;
          const expandido = aberto === a.nome;
          return (
            <li key={a.nome} className={expandido ? "bg-secondary/20" : "hover:bg-secondary/20"}>
              <button
                type="button"
                onClick={() => setAberto((cur) => (cur === a.nome ? null : a.nome))}
                className="w-full text-left px-4 py-3 flex items-center gap-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase">
                  {a.nome.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{a.nome}</span>
                    {completo ? (
                      <Award className="h-3.5 w-3.5 shrink-0 text-success" />
                    ) : null}
                    <StatusAluno
                      completo={completo}
                      ativaHoje={a.segundosHoje > 0}
                      progresso={a.progresso}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {completo
                      ? "Trilha concluída"
                      : a.fase === "texto"
                        ? "Fase: conversas de WhatsApp"
                        : a.fase === "voz"
                          ? "Fase: ligações"
                          : "Fase: prova"}
                    {" · "}
                    {formatDuracao(a.segundosTotal)} na plataforma
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                  <span className="inline-flex items-center gap-1 w-16">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {a.conversas}/{META_WHATSAPP}
                  </span>
                  <span className="inline-flex items-center gap-1 w-16">
                    <Phone className="h-3.5 w-3.5" />
                    {a.ligacoes}/{META_LIGACOES}
                  </span>
                  <span className="inline-flex items-center gap-1 w-14">
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    {a.provas}
                  </span>
                  <span className="inline-flex items-center gap-1 w-14">
                    <Flame className="h-3.5 w-3.5" />
                    {a.dias}d
                  </span>
                </div>
                <div className="w-28 shrink-0">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                    <span>{a.progresso}%</span>
                    {a.ultimo && (
                      <span className="hidden sm:inline">
                        {new Date(`${a.ultimo}T12:00:00`).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${completo ? "bg-[color:var(--success)]" : "bg-primary"}`}
                      style={{ width: `${a.progresso}%` }}
                    />
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expandido ? "rotate-180" : ""}`}
                />
              </button>

              {expandido && (
              <div className="px-4 pb-4 space-y-4">
              <div className="grid sm:grid-cols-2 gap-2">
                <ModuleRow
                  done={a.segundosTotal >= 3600}
                  titulo="1 hora de plataforma"
                  detalhe={`${formatDuracao(a.segundosTotal)} de 1h · hoje ${formatDuracao(a.segundosHoje)}`}
                />
                <ModuleRow
                  done={a.conversas >= META_WHATSAPP}
                  titulo={`${META_WHATSAPP} conversas de WhatsApp`}
                  detalhe={`${a.conversas} de ${META_WHATSAPP} concluídas`}
                  action={
                    <Link to="/app/coach/roleplay/$nome" params={{ nome: a.nome }}>
                      <Button size="sm" variant="outline">
                        Treinar
                      </Button>
                    </Link>
                  }
                />
                <ModuleRow
                  done={a.ligacoes >= META_LIGACOES}
                  titulo={`${META_LIGACOES} treinos de ligação`}
                  detalhe={`${a.ligacoes} de ${META_LIGACOES} concluídos${a.roleplays ? ` · média ${a.mediaRoleplay.toFixed(1)}` : ""}`}
                  action={
                    <Link to="/app/coach/roleplay/$nome" params={{ nome: a.nome }}>
                      <Button size="sm" variant="outline">
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  }
                />
                <ModuleRow
                  done={a.provas > 0}
                  titulo="Prova de conversão"
                  detalhe={
                    a.provas > 0
                      ? `${a.provas} ${a.provas === 1 ? "prova" : "provas"} · média ${a.mediaProva.toFixed(1)}`
                      : "Prova não realizada"
                  }
                  action={
                    <Link to="/app/coach/prova/$nome" params={{ nome: a.nome }}>
                      <Button size="sm" variant="outline">
                        {a.provas > 0 ? "Nova prova" : "Fazer prova"}
                      </Button>
                    </Link>
                  }
                />
                <ModuleRow
                  done={a.dias >= 3}
                  titulo="Constância de estudo"
                  detalhe={`${a.dias} de 3 dias · ${a.analises} ${a.analises === 1 ? "atendimento avaliado" : "atendimentos avaliados"}`}
                />
              </div>

              <div className="space-y-4">
                    <Section icon={History} title="Atendimentos analisados">
                      {a.analises === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nenhum atendimento analisado ainda.
                        </p>
                      ) : (
                        <ul className="divide-y">
                          {history
                            .filter((h) => h.atendente === a.nome)
                            .map((it) => (
                              <li key={it.id} className="py-2.5">
                                <div className="flex items-center gap-3">
                                  <Badge variant="outline" className="text-[10px] shrink-0">
                                    {(Number(it.pontuacao) || 0).toFixed(1)}
                                  </Badge>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{it.titulo}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(it.created_at).toLocaleString("pt-BR", {
                                        timeZone: "America/Sao_Paulo",
                                        day: "2-digit",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </p>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-wrap">
                                  {it.preview}
                                </p>
                              </li>
                            ))}
                        </ul>
                      )}
                    </Section>
                    <RoleplayHistorySection atendente={a.nome} />
                    <ProvaHistorySection atendente={a.nome} />
              </div>
              </div>
              )}
            </li>
          );
        })}
        </ul>
        </div>
        ))}
      </div>
    </div>
  );
}

function ModuleRow({
  done,
  titulo,
  detalhe,
  action,
}: {
  done: boolean;
  titulo: string;
  detalhe: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2">
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[color:var(--success)]" />
      ) : (
        <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{titulo}</p>
        <p className="text-xs text-muted-foreground truncate">{detalhe}</p>
      </div>
      {action}
    </div>
  );
}

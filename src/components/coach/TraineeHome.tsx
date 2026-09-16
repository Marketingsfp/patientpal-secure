import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardCheck,
  Clock,
  Flame,
  GraduationCap,
  MessageCircle,
  Phone,
  Play,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { HistoricoAtendente } from "@/components/coach/HistoricoAtendente";
import { MinhaMeta } from "@/components/coach/MinhaMeta";
import { BotaoCertificado } from "@/components/coach/Certificado";
import { EvolucaoAtendente } from "@/components/coach/EvolucaoAtendente";
import { temaClinica } from "@/lib/coach/clinica-tema";
import { ehDeHoje } from "@/lib/coach/data-atual";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchTempoEstudo,
  formatDuracao,
  useStudyTimer,
  type TempoRow,
} from "@/lib/coach/study-time";

type NotaRow = { nota: number; created_at: string };
type RoleplayNotaRow = NotaRow & { modo?: string | null };

/** Metas obrigatórias do curso. */
const META_LIGACOES = 5;
const META_WHATSAPP = 5;

export function TraineeHome({
  atendente,
  clinicaId,
  clinicaNome,
}: {
  atendente: string;
  clinicaId: string | null;
  clinicaNome: string | null;
}) {
  useStudyTimer(atendente, "plataforma", clinicaId);

  const [tempos, setTempos] = useState<TempoRow[]>([]);
  const [provas, setProvas] = useState<NotaRow[]>([]);
  const [roleplays, setRoleplays] = useState<RoleplayNotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const nomeClinica = clinicaNome ?? "sua clínica";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clinicaId) {
        setLoading(false);
        return;
      }
      const [t, p, r] = await Promise.all([
        fetchTempoEstudo(clinicaId),
        supabase
          .from("coach_provas")
          .select("nota,created_at")
          .eq("clinica_id", clinicaId)
          .eq("atendente", atendente)
          .limit(500),
        supabase
          .from("coach_roleplay_sessions")
          .select("nota,created_at,modo")
          .eq("clinica_id", clinicaId)
          .eq("atendente", atendente)
          .limit(500),
      ]);
      if (cancelled) return;
      setTempos(t.filter((x) => x.atendente === atendente));
      setProvas((p.data ?? []) as unknown as NotaRow[]);
      setRoleplays((r.data ?? []) as unknown as RoleplayNotaRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [atendente, clinicaId]);

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const resumo = useMemo(() => {
    const segundosTotal = tempos.reduce((s, x) => s + (Number(x.segundos) || 0), 0);
    const segundosHoje = tempos
      .filter((x) => x.dia === hoje)
      .reduce((s, x) => s + (Number(x.segundos) || 0), 0);
    const dias = new Set(
      tempos.filter((x) => (Number(x.segundos) || 0) > 0).map((x) => x.dia),
    ).size;
    const media = (arr: NotaRow[]) =>
      arr.length ? arr.reduce((s, x) => s + (Number(x.nota) || 0), 0) / arr.length : 0;
    // A trilha zera todos os dias: contam apenas as atividades feitas hoje.
    const roleplaysHoje = roleplays.filter((r) => ehDeHoje(r.created_at));
    const provasHoje = provas.filter((x) => ehDeHoje(x.created_at));
    const ligacoes = roleplaysHoje.filter((r) => (r.modo ?? "voz") === "voz").length;
    const whatsapp = roleplaysHoje.filter((r) => r.modo === "texto").length;
    const feitos = [
      segundosHoje >= 3600,
      provasHoje.length > 0,
      ligacoes >= META_LIGACOES,
      whatsapp >= META_WHATSAPP,
    ];
    return {
      segundosTotal,
      segundosHoje,
      dias,
      ligacoes,
      whatsapp,
      provasHoje: provasHoje.length,
      mediaProva: media(provas),
      mediaRoleplay: media(roleplays),
      progresso: Math.round((feitos.filter(Boolean).length / feitos.length) * 100),
    };
  }, [tempos, provas, roleplays, hoje]);

  const completo = resumo.progresso === 100;
  const tema = temaClinica(nomeClinica);

  /** Próximo passo da trilha: WhatsApp → ligações → prova. */
  const proximo =
    resumo.whatsapp < META_WHATSAPP
      ? {
          titulo: "Conversa de WhatsApp",
          detalhe: `${resumo.whatsapp} de ${META_WHATSAPP} conversas concluídas`,
          icone: MessageCircle,
        }
      : resumo.ligacoes < META_LIGACOES
        ? {
            titulo: "Treino de ligação",
            detalhe: `${resumo.ligacoes} de ${META_LIGACOES} ligações concluídas`,
            icone: Phone,
          }
        : resumo.provasHoje === 0
          ? {
              titulo: "Prova de conversão",
              detalhe: "Última etapa da trilha",
              icone: ClipboardCheck,
            }
          : {
              titulo: "Revisar e praticar",
              detalhe: "Trilha concluída — pratique para melhorar a nota",
              icone: GraduationCap,
            };

  return (
    <div className="bg-background">
      {/* Cabeçalho compacto com a identidade da clínica */}
      <header
        className="relative overflow-hidden text-white px-4 pt-5 pb-20"
        style={{ backgroundImage: tema.gradiente }}
      >
        <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="relative mx-auto max-w-3xl">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/15 backdrop-blur ring-1 ring-white/25 text-sm font-bold">
              {tema.logo ? (
                <img
                  src={tema.logo}
                  alt={`Logo ${nomeClinica}`}
                  className="h-[70%] w-[80%] object-contain"
                />
              ) : (
                tema.monograma
              )}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="font-display truncate text-sm font-semibold">{nomeClinica}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/70">
                Treinamento de conversão
              </div>
            </div>
          </div>

          <h1 className="mt-6 text-2xl md:text-3xl font-bold tracking-tight">
            Olá, {atendente} 👋
          </h1>
          <p className="mt-1 text-sm text-white/80">
            O tempo de estudo é contado automaticamente. Continue de onde parou.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24 -mt-14 relative z-10 space-y-4">
        {/* Bloco principal: continuar o treinamento */}
        <section className="rounded-3xl border bg-card p-6 md:p-7 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Próximo passo
              </p>
              <h2 className="mt-1 flex items-center gap-2 text-xl md:text-2xl font-bold tracking-tight">
                <proximo.icone className="h-5 w-5 text-primary shrink-0" />
                {proximo.titulo}
              </h2>
              {loading ? (
                <Skeleton className="mt-2 h-4 w-56" />
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{proximo.detalhe}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              {loading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <p className="kpi-number text-4xl">{resumo.progresso}%</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">da trilha</p>
            </div>
          </div>

          <div className="mt-4 h-2.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${completo ? "bg-success" : "bg-primary"}`}
              style={{ width: `${resumo.progresso}%` }}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link to="/app/coach/roleplay/$nome" params={{ nome: atendente }}>
              <Button size="lg" className="rounded-full">
                <Play className="h-4 w-4 mr-2" /> Continuar treinamento
              </Button>
            </Link>
            <Link to="/app/coach/prova/$nome" params={{ nome: atendente }}>
              <Button size="lg" variant="outline" className="rounded-full">
                <ClipboardCheck className="h-4 w-4 mr-2" /> Fazer a prova
              </Button>
            </Link>
            {completo && (
              <Badge className="bg-success/15 text-success border-0">
                <Award className="h-3 w-3 mr-1" /> Trilha concluída
              </Badge>
            )}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 border-t pt-4">
            {loading ? (
              <>
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </>
            ) : (
              <>
                <MiniStat
                  icone={Clock}
                  valor={formatDuracao(resumo.segundosHoje)}
                  label="de estudo hoje"
                />
                <MiniStat
                  icone={Flame}
                  valor={`${resumo.dias} ${resumo.dias === 1 ? "dia" : "dias"}`}
                  label="de constância"
                />
                <MiniStat
                  icone={Target}
                  valor={formatDuracao(resumo.segundosTotal)}
                  label="acumulado"
                />
              </>
            )}
          </div>
        </section>

        {/* Detalhes da trilha, recolhido por padrão */}
        <Bloco titulo="Minha trilha" icone={BookOpen} detalhe={`${resumo.progresso}% concluído`}>
          {loading ? (
            <div className="grid sm:grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              <Modulo
                done={resumo.whatsapp >= META_WHATSAPP}
                titulo={`${META_WHATSAPP} conversas de WhatsApp hoje`}
                detalhe={`${resumo.whatsapp} de ${META_WHATSAPP} concluídas`}
              />
              <Modulo
                done={resumo.ligacoes >= META_LIGACOES}
                titulo={`${META_LIGACOES} treinos de ligação hoje`}
                detalhe={`${resumo.ligacoes} de ${META_LIGACOES} concluídos`}
              />
              <Modulo
                done={resumo.provasHoje > 0}
                titulo="Prova de conversão"
                detalhe={
                  resumo.provasHoje
                    ? `feita hoje · média geral ${resumo.mediaProva.toFixed(1)}`
                    : "Ainda não realizada hoje"
                }
              />
              <Modulo
                done={resumo.segundosHoje >= 3600}
                titulo="1 hora de plataforma hoje"
                detalhe={`${formatDuracao(resumo.segundosHoje)} de 1h`}
              />
              <Modulo
                done={resumo.dias >= 3}
                titulo="Constância de estudo"
                detalhe={`${resumo.dias} de 3 dias`}
              />
            </div>
          )}
        </Bloco>

        {completo && (
          <BotaoCertificado
            dados={{
              atendente,
              clinica: nomeClinica,
              segundosTotal: resumo.segundosTotal,
              dias: resumo.dias,
              conversas: resumo.whatsapp,
              ligacoes: resumo.ligacoes,
              mediaProva: resumo.mediaProva,
              mediaRoleplay: resumo.mediaRoleplay,
            }}
          />
        )}

        <MinhaMeta atendente={atendente} clinicaId={clinicaId} />

        <Bloco titulo="Minha evolução" icone={Flame} detalhe="notas e erros recorrentes">
          <EvolucaoAtendente atendente={atendente} clinicaId={clinicaId} />
        </Bloco>

        <Bloco titulo="Histórico e feedbacks" icone={ClipboardCheck} detalhe="tudo que já fiz">
          <HistoricoAtendente atendente={atendente} clinicaId={clinicaId} />
        </Bloco>

        <div className="rounded-2xl border bg-secondary/40 p-5 text-sm text-muted-foreground flex gap-3">
          <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span>
            Foco do curso: transformar cada conversa em agendamento. Siga os scripts, confirme
            data e horário e nunca encerre sem oferecer uma opção de agenda.
          </span>
        </div>
      </main>
    </div>
  );
}

function MiniStat({
  icone: Icone,
  valor,
  label,
}: {
  icone: typeof Clock;
  valor: string;
  label: string;
}) {
  return (
    <div className="leading-tight">
      <p className="kpi-number text-base flex items-center gap-1.5">
        <Icone className="h-3.5 w-3.5 text-primary" />
        {valor}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

/** Seção secundária recolhível, para não competir com o bloco principal. */
function Bloco({
  titulo,
  icone: Icone,
  detalhe,
  children,
}: {
  titulo: string;
  icone: typeof BookOpen;
  detalhe?: string;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <Collapsible open={aberto} onOpenChange={setAberto}>
      <div className="rounded-2xl border bg-card shadow-[var(--shadow-soft)] overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-secondary/40 transition-colors"
          >
            <Icone className="h-4 w-4 text-primary shrink-0" />
            <span className="font-display text-sm font-semibold">{titulo}</span>
            {detalhe && (
              <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                {detalhe}
              </span>
            )}
            <ChevronDown
              className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-5 pb-5">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function Modulo({
  done,
  titulo,
  detalhe,
}: {
  done: boolean;
  titulo: string;
  detalhe: string;
}) {
  return (
    <div
      className={`rounded-xl border p-3 flex items-start gap-3 ${done ? "border-success/40 bg-success/5" : ""}`}
    >
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs text-muted-foreground">{detalhe}</p>
      </div>
    </div>
  );
}

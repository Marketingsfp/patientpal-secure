import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClinicaProvider, useClinica } from "@/hooks/use-clinica";
import { Loader2, Sun, Moon } from "lucide-react";

export const Route = createFileRoute("/painel")({
  component: PainelRoute,
  head: () => ({
    meta: [
      { title: "Painel de senhas — ClinicaOS" },
      { name: "description", content: "Painel público de chamada de senhas da clínica." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PainelRoute() {
  return (
    <ClinicaProvider>
      <PainelPage />
    </ClinicaProvider>
  );
}

type Senha = {
  id: string;
  codigo: string;
  tipo: "N" | "P" | "E" | "R";
  status: string;
  guiche: string | null;
  chamada_em: string | null;
  paciente_id?: string | null;
  paciente_nome?: string | null;
};

function PainelPage() {
  const { clinicaAtual, loading } = useClinica();
  const [atual, setAtual] = useState<Senha | null>(null);
  const [historico, setHistorico] = useState<Senha[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const jaFaladoRef = useRef<Set<string>>(new Set());
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("painel-theme") as "dark" | "light") ?? "dark";
  });
  const isLight = theme === "light";
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("painel-theme", theme);
  }, [theme]);

  // Destrava o áudio automaticamente no primeiro gesto do usuário em
  // QUALQUER lugar da página (política de autoplay dos navegadores).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlock = () => {
      try {
        if ("speechSynthesis" in window) {
          const u = new SpeechSynthesisUtterance(" ");
          u.volume = 0;
          window.speechSynthesis.speak(u);
        }
        const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
          ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC && !audioCtxRef.current) audioCtxRef.current = new AC();
        void audioCtxRef.current?.resume();
      } catch { /* ignore */ }
    };
    // Tenta imediatamente (funciona se a aba já teve interação)
    unlock();
    // Mantém sempre ativo: reexecuta o unlock a cada gesto e quando a aba
    // volta a ficar visível (kiosque que fica horas aberto sem foco).
    const opts = { capture: true } as const;
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
    document.addEventListener("visibilitychange", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock, opts);
      window.removeEventListener("keydown", unlock, opts);
      window.removeEventListener("touchstart", unlock, opts);
      document.removeEventListener("visibilitychange", unlock);
    };
  }, []);

  const t = isLight ? {
    root: "bg-[#f6f7fb] text-slate-900",
    accent: "text-blue-600",
    heading: "text-slate-900",
    clock: "text-slate-500",
    headerBorder: "border-slate-200",
    heroCard: "bg-white border border-slate-200 shadow-xl",
    heroGlow: "bg-blue-500/10",
    badgeActive: "bg-blue-600 text-white",
    badgeIdle: "bg-slate-100 border border-slate-200 text-slate-500",
    ticket: "text-slate-900 drop-shadow-sm",
    patient: "text-slate-700",
    guicheLabel: "text-slate-500",
    guicheValue: "text-blue-600",
    aside: "bg-white border border-slate-200",
    asideTitle: "text-slate-500",
    asideEmpty: "text-slate-400",
    itemFirst: "bg-blue-50 border border-blue-100",
    itemRest: "bg-slate-50 border border-slate-100",
    itemCodeFirst: "text-blue-600",
    itemCodeRest: "text-slate-500",
    itemNameFirst: "text-slate-700",
    itemNameRest: "text-slate-500",
    itemLabel: "text-slate-400",
    itemGuicheFirst: "text-slate-900",
    itemGuicheRest: "text-slate-500",
    footerBorder: "border-slate-200",
    footerText: "text-slate-400",
    idleText: "text-slate-400",
    toggle: "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50",
  } : {
    root: "bg-[#0a0b10] text-white",
    accent: "text-blue-400",
    heading: "text-white",
    clock: "text-slate-400",
    headerBorder: "border-white/10",
    heroCard: "bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 shadow-2xl",
    heroGlow: "bg-blue-600/10",
    badgeActive: "bg-blue-600 text-white",
    badgeIdle: "bg-white/5 border border-white/10 text-slate-400",
    ticket: "text-white drop-shadow-2xl",
    patient: "text-slate-200",
    guicheLabel: "text-slate-400",
    guicheValue: "text-blue-400",
    aside: "bg-white/[0.03] border border-white/10",
    asideTitle: "text-slate-500",
    asideEmpty: "text-slate-600",
    itemFirst: "bg-white/5 border border-white/5",
    itemRest: "bg-white/[0.02] border border-white/5",
    itemCodeFirst: "text-blue-400",
    itemCodeRest: "text-slate-400",
    itemNameFirst: "text-slate-300",
    itemNameRest: "text-slate-500",
    itemLabel: "text-slate-500",
    itemGuicheFirst: "text-white",
    itemGuicheRest: "text-slate-400",
    footerBorder: "border-white/5",
    footerText: "text-slate-600",
    idleText: "text-slate-500",
    toggle: "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10",
  };

  useEffect(() => {
    if (!clinicaAtual) return;
    const clinicaId = clinicaAtual.clinica_id;

    const carregar = async () => {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("senhas")
        .select("id, codigo, tipo, status, guiche, chamada_em, paciente_id, pacientes(nome)")
        .eq("clinica_id", clinicaId)
        .eq("data_dia", hoje)
        .in("status", ["chamada", "atendida"])
        .order("chamada_em", { ascending: false })
        .limit(6);
      const lista = ((data ?? []) as Array<Senha & { pacientes?: { nome: string } | null }>).map((s) => ({
        ...s,
        paciente_nome: s.pacientes?.nome ?? null,
      })) as Senha[];
      setAtual(lista[0] ?? null);
      setHistorico(lista.slice(1));
    };

    void carregar();

    const ch = supabase
      .channel(`painel-${clinicaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "senhas", filter: `clinica_id=eq.${clinicaId}` },
        async (payload) => {
          void carregar();
          const novo = payload.new as Senha | undefined;
          if (
            (payload.eventType === "UPDATE" || payload.eventType === "INSERT") &&
            novo?.status === "chamada"
          ) {
            const key = `${novo.id}:${novo.chamada_em ?? ""}`;
            if (jaFaladoRef.current.has(key)) return;
            jaFaladoRef.current.add(key);
            let nome: string | null = null;
            if (novo.paciente_id) {
              const { data: p } = await supabase
                .from("pacientes")
                .select("nome")
                .eq("id", novo.paciente_id)
                .maybeSingle();
              nome = p?.nome ?? null;
            }
            falar({ ...novo, paciente_nome: nome });
          }
        },
      )
      .subscribe((status) => {
        // eslint-disable-next-line no-console
        console.info("[painel] realtime status:", status);
      });

    // Fallback de polling: garante atualização mesmo se o canal de realtime
    // cair silenciosamente (proxy, sleep de aba, RLS bloqueando o socket).
    const poll = window.setInterval(() => { void carregar(); }, 3000);
    const onVis = () => { if (document.visibilityState === "visible") void carregar(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
      void supabase.removeChannel(ch);
    };
  }, [clinicaAtual?.clinica_id]);

  function falar(s: Senha) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const ehNome = /[a-zA-Z]{3,}/.test(s.codigo) && /\s/.test(s.codigo.trim());
    let texto: string;
    if (ehNome) {
      texto = `${s.codigo}${s.guiche ? `, ${s.guiche}` : ""}`;
    } else {
      const tipoNome = { N: "Comum", P: "Preferencial", E: "Prioridade", R: "Retorno" }[s.tipo];
      const nomePart = s.paciente_nome ? `, ${s.paciente_nome}` : "";
      texto = `Senha ${tipoNome} ${s.codigo.replace("-", " ")}${nomePart}${s.guiche ? `, guichê ${s.guiche}` : ""}`;
    }
    window.speechSynthesis.cancel();
    tocarDing();
    const dizer = (delayMs: number) => {
      window.setTimeout(() => {
        const utter = new SpeechSynthesisUtterance(texto);
        utter.lang = "pt-BR";
        utter.rate = 0.9;
        window.speechSynthesis.speak(utter);
      }, delayMs);
    };
    dizer(700);
    dizer(4500);
  }

  function tocarDing() {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando painel…</p>
        </div>
      </div>
    );
  }

  if (!clinicaAtual) return <div className="min-h-screen flex items-center justify-center bg-background">Nenhuma clínica selecionada.</div>;

  return (
    <div className={`h-screen w-full overflow-hidden ${t.root} p-[clamp(0.75rem,2vw,2rem)] flex flex-col transition-colors`}>
      <header className={`grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 mb-[clamp(0.5rem,1.5vh,1.5rem)] border-b ${t.headerBorder} pb-[clamp(0.5rem,1.2vh,1.25rem)]`}>
        <div className="min-w-0">
          <p className={`${t.accent} font-bold tracking-widest text-[clamp(0.7rem,1.2vw,0.95rem)] uppercase mb-1`}>Painel de Chamada</p>
          <h1 className={`truncate font-black uppercase tracking-tight ${t.heading} text-[clamp(1.25rem,3vw,2.5rem)]`}>{clinicaAtual.clinica.nome}</h1>
        </div>
        <div className="flex items-center gap-[clamp(0.75rem,1.5vw,1.5rem)] shrink-0">
          <button
            type="button"
            onClick={() => setTheme(isLight ? "dark" : "light")}
            aria-label={isLight ? "Mudar para modo escuro" : "Mudar para modo claro"}
            className={`h-10 w-10 sm:h-11 sm:w-11 lg:h-12 lg:w-12 rounded-full flex items-center justify-center transition ${t.toggle}`}
          >
            {isLight ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
          <div className={`font-medium tabular-nums ${t.clock} text-[clamp(1.25rem,2.5vw,2.5rem)]`}><PainelClock /></div>
        </div>
      </header>

      <main className="flex flex-1 flex-col lg:flex-row gap-[clamp(0.75rem,1.5vw,2rem)] min-h-0">
        <div className={`flex-[2] min-h-0 min-w-0 relative overflow-hidden ${t.heroCard} rounded-[clamp(1rem,2vw,2rem)] flex flex-col items-center justify-center p-[clamp(0.75rem,2vw,2.5rem)]`}>
          <div className={`absolute -top-24 -left-24 w-96 h-96 ${t.heroGlow} blur-[120px] rounded-full pointer-events-none`} />
          <div className="relative z-10 text-center w-full">
            {atual ? (() => {
              const ehNome = /[a-zA-Z]{3,}/.test(atual.codigo) && /\s/.test(atual.codigo.trim());
              const fonte = ehNome
                ? (atual.codigo.length > 16
                    ? "text-[clamp(2rem,min(6vw,9vh),4.5rem)]"
                    : atual.codigo.length > 10
                      ? "text-[clamp(2.5rem,min(7vw,11vh),5.5rem)]"
                      : "text-[clamp(3rem,min(9vw,14vh),7rem)]")
                : "text-[clamp(4rem,min(16vw,26vh),14rem)] tabular-nums";
              return (
                <>
                  <span className={`inline-block px-[clamp(0.75rem,1.2vw,1.25rem)] py-[clamp(0.25rem,0.5vw,0.5rem)] rounded-full ${t.badgeActive} font-bold uppercase tracking-[0.2em] mb-[clamp(0.5rem,min(2vw,2vh),1.5rem)] text-[clamp(0.7rem,1vw,1.1rem)]`}>
                    Chamando Agora
                  </span>
                  <div className={`${fonte} font-black leading-none ${t.ticket} tracking-tighter break-words max-w-full mb-[clamp(0.5rem,min(1.5vw,1.5vh),1rem)]`}>
                    {atual.codigo}
                  </div>
                  {!ehNome && atual.paciente_nome && (
                    <h3 className={`font-bold ${t.patient} tracking-tight uppercase break-words max-w-full text-[clamp(1rem,min(3.5vw,5vh),3rem)]`}>
                      {atual.paciente_nome}
                    </h3>
                  )}
                  <div className="flex items-center justify-center gap-[clamp(0.5rem,1.2vw,1.25rem)] mt-[clamp(0.5rem,min(2vw,2.5vh),1.5rem)]">
                    {!ehNome && (
                      <span className={`${t.guicheLabel} font-medium uppercase tracking-widest text-[clamp(0.85rem,min(2vw,3vh),1.75rem)]`}>Guichê</span>
                    )}
                    <span className={`font-black ${t.guicheValue} text-[clamp(2rem,min(6vw,9vh),5rem)]`}>{atual.guiche ?? "—"}</span>
                  </div>
                </>
              );
            })() : (
              <>
                <span className={`inline-block px-[clamp(0.75rem,1.2vw,1.25rem)] py-[clamp(0.25rem,0.5vw,0.5rem)] rounded-full ${t.badgeIdle} font-bold uppercase tracking-[0.2em] mb-[clamp(0.5rem,2vh,1.5rem)] text-[clamp(0.7rem,1vw,1.1rem)]`}>
                  Chamando Agora
                </span>
                <div className={`${t.idleText} font-light text-[clamp(1.25rem,min(3.5vw,5vh),2.5rem)]`}>Aguardando chamada…</div>
              </>
            )}
          </div>
        </div>

        <aside className={`flex-1 min-h-0 min-w-0 ${t.aside} rounded-[clamp(1rem,2vw,2rem)] p-[clamp(0.75rem,1.5vw,1.75rem)] flex flex-col`}>
          <h3 className={`font-bold uppercase tracking-widest ${t.asideTitle} mb-[clamp(0.5rem,1.5vh,1.5rem)] pl-2 lg:pl-4 text-[clamp(0.8rem,1.2vw,1.25rem)]`}>
            Anteriores
          </h3>
          <div className="space-y-[clamp(0.4rem,0.8vh,0.85rem)] flex-1 overflow-y-auto min-h-0">
            {historico.length === 0 && (
              <div className={`${t.asideEmpty} pl-2 lg:pl-4 text-[clamp(0.9rem,1.4vw,1.125rem)]`}>Sem chamadas anteriores</div>
            )}
            {historico.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center justify-between p-[clamp(0.6rem,min(1.2vw,1.6vh),1.25rem)] rounded-[clamp(0.75rem,1.2vw,1.25rem)] ${i === 0 ? t.itemFirst : t.itemRest}`}
              >
                <div className="min-w-0">
                  <p className={`font-black tabular-nums mb-1 truncate ${i === 0 ? t.itemCodeFirst : t.itemCodeRest} text-[clamp(1rem,min(2vw,3vh),1.85rem)]`}>
                    {s.codigo}
                  </p>
                  {s.paciente_nome && (
                    <p className={`font-bold uppercase truncate ${i === 0 ? t.itemNameFirst : t.itemNameRest} text-[clamp(0.7rem,1.1vw,1.1rem)]`}>
                      {s.paciente_nome}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 pl-3">
                  <p className={`${t.itemLabel} uppercase font-bold tracking-widest mb-1 text-[clamp(0.5rem,0.75vw,0.7rem)]`}>Guichê</p>
                  <p className={`font-black ${i === 0 ? t.itemGuicheFirst : t.itemGuicheRest} text-[clamp(1.25rem,min(2.2vw,3vh),1.85rem)]`}>
                    {s.guiche ?? "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className={`mt-auto pt-[clamp(0.5rem,1vh,1.25rem)] border-t ${t.footerBorder} text-center`}>
            <p className={`${t.footerText} font-medium text-[clamp(0.7rem,1vw,0.95rem)]`}>Por favor, dirija-se ao guichê indicado.</p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function PainelClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{now.toLocaleTimeString("pt-BR")}</span>;
}
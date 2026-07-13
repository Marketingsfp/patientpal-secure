import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("painel-theme") as "dark" | "light") ?? "dark";
  });
  const isLight = theme === "light";
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("painel-theme", theme);
  }, [theme]);

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
      .subscribe();

    return () => { void supabase.removeChannel(ch); };
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
    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = "pt-BR";
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
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
    <div className={`min-h-screen w-full ${t.root} p-8 lg:p-12 flex flex-col transition-colors`}>
      <header className={`flex justify-between items-end mb-8 lg:mb-12 border-b ${t.headerBorder} pb-6 lg:pb-8`}>
        <div>
          <p className={`${t.accent} font-bold tracking-widest text-sm uppercase mb-1`}>Painel de Chamada</p>
          <h1 className={`text-3xl lg:text-4xl font-black uppercase tracking-tight ${t.heading}`}>{clinicaAtual.clinica.nome}</h1>
        </div>
        <div className="flex items-center gap-4 lg:gap-6">
          <button
            type="button"
            onClick={() => setTheme(isLight ? "dark" : "light")}
            aria-label={isLight ? "Mudar para modo escuro" : "Mudar para modo claro"}
            className={`h-11 w-11 lg:h-12 lg:w-12 rounded-full flex items-center justify-center transition ${t.toggle}`}
          >
            {isLight ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
          <div className={`text-3xl lg:text-4xl font-medium tabular-nums ${t.clock}`}><PainelClock /></div>
        </div>
      </header>

      <main className="flex flex-1 flex-col lg:flex-row gap-6 lg:gap-10">
        <div className={`flex-[2] relative overflow-hidden ${t.heroCard} rounded-[40px] flex flex-col items-center justify-center p-10 lg:p-16`}>
          <div className={`absolute -top-24 -left-24 w-96 h-96 ${t.heroGlow} blur-[120px] rounded-full pointer-events-none`} />
          <div className="relative z-10 text-center w-full">
            {atual ? (() => {
              const ehNome = /[a-zA-Z]{3,}/.test(atual.codigo) && /\s/.test(atual.codigo.trim());
              const fonte = ehNome
                ? (atual.codigo.length > 16 ? "text-6xl lg:text-7xl" : atual.codigo.length > 10 ? "text-7xl lg:text-8xl" : "text-8xl lg:text-9xl")
                : "text-[10rem] lg:text-[18rem] tabular-nums";
              return (
                <>
                  <span className={`inline-block px-6 py-2 rounded-full ${t.badgeActive} font-bold text-lg lg:text-xl uppercase tracking-[0.2em] mb-8 lg:mb-12`}>
                    Chamando Agora
                  </span>
                  <div className={`${fonte} font-black leading-none ${t.ticket} tracking-tighter break-words max-w-full mb-6`}>
                    {atual.codigo}
                  </div>
                  {!ehNome && atual.paciente_nome && (
                    <h3 className={`text-4xl lg:text-6xl font-bold ${t.patient} tracking-tight uppercase break-words max-w-full`}>
                      {atual.paciente_nome}
                    </h3>
                  )}
                  <div className="flex items-center justify-center gap-4 lg:gap-6 mt-8 lg:mt-12">
                    {!ehNome && (
                      <span className={`text-2xl lg:text-4xl ${t.guicheLabel} font-medium uppercase tracking-widest`}>Guichê</span>
                    )}
                    <span className={`text-6xl lg:text-8xl font-black ${t.guicheValue}`}>{atual.guiche ?? "—"}</span>
                  </div>
                </>
              );
            })() : (
              <>
                <span className={`inline-block px-6 py-2 rounded-full ${t.badgeIdle} font-bold text-lg lg:text-xl uppercase tracking-[0.2em] mb-8`}>
                  Chamando Agora
                </span>
                <div className={`text-4xl lg:text-5xl ${t.idleText} font-light`}>Aguardando chamada…</div>
              </>
            )}
          </div>
        </div>

        <aside className={`flex-1 ${t.aside} rounded-[40px] p-6 lg:p-10 flex flex-col`}>
          <h3 className={`text-xl lg:text-2xl font-bold uppercase tracking-widest ${t.asideTitle} mb-6 lg:mb-10 pl-2 lg:pl-4`}>
            Anteriores
          </h3>
          <div className="space-y-3 lg:space-y-4 flex-1">
            {historico.length === 0 && (
              <div className={`${t.asideEmpty} text-lg pl-2 lg:pl-4`}>Sem chamadas anteriores</div>
            )}
            {historico.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center justify-between p-5 lg:p-8 rounded-3xl ${i === 0 ? t.itemFirst : t.itemRest}`}
              >
                <div className="min-w-0">
                  <p className={`text-3xl lg:text-4xl font-black tabular-nums mb-1 truncate ${i === 0 ? t.itemCodeFirst : t.itemCodeRest}`}>
                    {s.codigo}
                  </p>
                  {s.paciente_nome && (
                    <p className={`text-base lg:text-xl font-bold uppercase truncate ${i === 0 ? t.itemNameFirst : t.itemNameRest}`}>
                      {s.paciente_nome}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 pl-4">
                  <p className={`text-[10px] lg:text-xs ${t.itemLabel} uppercase font-bold tracking-widest mb-1`}>Guichê</p>
                  <p className={`text-3xl lg:text-4xl font-black ${i === 0 ? t.itemGuicheFirst : t.itemGuicheRest}`}>
                    {s.guiche ?? "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className={`mt-auto pt-6 lg:pt-8 border-t ${t.footerBorder} text-center`}>
            <p className={`${t.footerText} font-medium text-sm lg:text-base`}>Por favor, dirija-se ao guichê indicado.</p>
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
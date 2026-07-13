import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClinicaProvider, useClinica } from "@/hooks/use-clinica";
import { Loader2 } from "lucide-react";

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
    <div className="min-h-screen w-full bg-[#0a0b10] text-white p-8 lg:p-12 flex flex-col">
      <header className="flex justify-between items-end mb-8 lg:mb-12 border-b border-white/10 pb-6 lg:pb-8">
        <div>
          <p className="text-blue-400 font-bold tracking-widest text-sm uppercase mb-1">Painel de Chamada</p>
          <h1 className="text-3xl lg:text-4xl font-black uppercase tracking-tight">{clinicaAtual.clinica.nome}</h1>
        </div>
        <div className="text-3xl lg:text-4xl font-medium tabular-nums text-slate-400"><PainelClock /></div>
      </header>

      <main className="flex flex-1 flex-col lg:flex-row gap-6 lg:gap-10">
        <div className="flex-[2] relative overflow-hidden bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-[40px] flex flex-col items-center justify-center p-10 lg:p-16 shadow-2xl">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          <div className="relative z-10 text-center w-full">
            {atual ? (() => {
              const ehNome = /[a-zA-Z]{3,}/.test(atual.codigo) && /\s/.test(atual.codigo.trim());
              const fonte = ehNome
                ? (atual.codigo.length > 16 ? "text-6xl lg:text-7xl" : atual.codigo.length > 10 ? "text-7xl lg:text-8xl" : "text-8xl lg:text-9xl")
                : "text-[10rem] lg:text-[18rem] tabular-nums";
              return (
                <>
                  <span className="inline-block px-6 py-2 rounded-full bg-blue-600 text-white font-bold text-lg lg:text-xl uppercase tracking-[0.2em] mb-8 lg:mb-12">
                    Chamando Agora
                  </span>
                  <div className={`${fonte} font-black leading-none text-white tracking-tighter drop-shadow-2xl break-words max-w-full mb-6`}>
                    {atual.codigo}
                  </div>
                  {!ehNome && atual.paciente_nome && (
                    <h3 className="text-4xl lg:text-6xl font-bold text-slate-200 tracking-tight uppercase break-words max-w-full">
                      {atual.paciente_nome}
                    </h3>
                  )}
                  <div className="flex items-center justify-center gap-4 lg:gap-6 mt-8 lg:mt-12">
                    {!ehNome && (
                      <span className="text-2xl lg:text-4xl text-slate-400 font-medium uppercase tracking-widest">Guichê</span>
                    )}
                    <span className="text-6xl lg:text-8xl font-black text-blue-400">{atual.guiche ?? "—"}</span>
                  </div>
                </>
              );
            })() : (
              <>
                <span className="inline-block px-6 py-2 rounded-full bg-white/5 border border-white/10 text-slate-400 font-bold text-lg lg:text-xl uppercase tracking-[0.2em] mb-8">
                  Chamando Agora
                </span>
                <div className="text-4xl lg:text-5xl text-slate-500 font-light">Aguardando chamada…</div>
              </>
            )}
          </div>
        </div>

        <aside className="flex-1 bg-white/[0.03] border border-white/10 rounded-[40px] p-6 lg:p-10 flex flex-col">
          <h3 className="text-xl lg:text-2xl font-bold uppercase tracking-widest text-slate-500 mb-6 lg:mb-10 pl-2 lg:pl-4">
            Anteriores
          </h3>
          <div className="space-y-3 lg:space-y-4 flex-1">
            {historico.length === 0 && (
              <div className="text-slate-600 text-lg pl-2 lg:pl-4">Sem chamadas anteriores</div>
            )}
            {historico.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center justify-between p-5 lg:p-8 rounded-3xl border border-white/5 ${i === 0 ? "bg-white/5" : "bg-white/[0.02]"}`}
              >
                <div className="min-w-0">
                  <p className={`text-3xl lg:text-4xl font-black tabular-nums mb-1 truncate ${i === 0 ? "text-blue-400" : "text-slate-400"}`}>
                    {s.codigo}
                  </p>
                  {s.paciente_nome && (
                    <p className={`text-base lg:text-xl font-bold uppercase truncate ${i === 0 ? "text-slate-300" : "text-slate-500"}`}>
                      {s.paciente_nome}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 pl-4">
                  <p className="text-[10px] lg:text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">Guichê</p>
                  <p className={`text-3xl lg:text-4xl font-black ${i === 0 ? "text-white" : "text-slate-400"}`}>
                    {s.guiche ?? "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-auto pt-6 lg:pt-8 border-t border-white/5 text-center">
            <p className="text-slate-600 font-medium text-sm lg:text-base">Por favor, dirija-se ao guichê indicado.</p>
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
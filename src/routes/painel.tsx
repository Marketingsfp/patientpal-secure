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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 text-white flex flex-col">
      <header className="px-12 py-6 flex items-center justify-between border-b border-white/10">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/60">Painel de chamada</div>
          <h1 className="text-3xl font-bold">{clinicaAtual.clinica.nome}</h1>
        </div>
        <div className="text-right text-white/70 text-xl tabular-nums"><PainelClock /></div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 p-12">
        <section className="lg:col-span-2 flex flex-col items-center justify-center bg-white/5 rounded-3xl p-12 border border-white/10">
          <div className="text-white/60 uppercase tracking-widest text-sm mb-4">Chamando agora</div>
          {atual ? (
            <>
              {(() => {
                const ehNome = /[a-zA-Z]{3,}/.test(atual.codigo) && /\s/.test(atual.codigo.trim());
                const fonte = ehNome
                  ? (atual.codigo.length > 16 ? "text-7xl" : atual.codigo.length > 10 ? "text-8xl" : "text-9xl")
                  : "text-[14rem] tabular-nums";
                return (
                  <>
                    <div className={`${fonte} font-black leading-none text-primary text-center break-words max-w-full`}>
                      {atual.codigo}
                    </div>
                    {!ehNome && atual.paciente_nome && (
                      <div className="text-5xl font-bold mt-4 text-center text-white break-words max-w-full">
                        {atual.paciente_nome}
                      </div>
                    )}
                    <div className="text-4xl mt-6 text-center">
                      {ehNome ? (
                        <span className="font-bold">{atual.guiche ?? "—"}</span>
                      ) : (
                        <>Guichê <span className="font-bold">{atual.guiche ?? "—"}</span></>
                      )}
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <div className="text-3xl text-white/40">Aguardando chamada…</div>
          )}
        </section>

        <aside className="bg-white/5 rounded-3xl p-8 border border-white/10">
          <div className="text-white/60 uppercase tracking-widest text-sm mb-6">Anteriores</div>
          <div className="space-y-4">
            {historico.length === 0 && <div className="text-white/30">Sem chamadas anteriores</div>}
            {historico.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-2xl border-b border-white/10 pb-3">
                <span className="font-bold tabular-nums">{s.codigo}</span>
                <span className="text-white/60">Guichê {s.guiche ?? "—"}</span>
              </div>
            ))}
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
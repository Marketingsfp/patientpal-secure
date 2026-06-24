import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClinicaProvider, useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Ticket,
  BadgeCheck,
  CalendarPlus,
  Camera,
  ArrowLeft,
  Loader2,
  X,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import {
  detectDescriptor,
  ensureFaceModels,
  euclidean,
  FACE_MATCH_THRESHOLD,
} from "@/lib/face-recognition";

export const Route = createFileRoute("/autoatendimento")({
  component: AutoatendimentoRoute,
});

function AutoatendimentoRoute() {
  return (
    <ClinicaProvider>
      <AutoatendimentoPage />
    </ClinicaProvider>
  );
}

type Hub =
  | "home"
  | "checkin"
  | "agendar"
  | "vagas"
  | "pagamento"
  | "ok-checkin"
  | "ok-agendar";
type IdentMode = "cpf" | "facial" | null;

type Vaga = {
  medico_id: string;
  medico_nome: string;
  agenda_id: string | null;
  inicio: string; // ISO
  fim: string;
  hora_label: string;
};

type FormaPagto = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito";

type ProcInfo = {
  id: string;
  nome: string;
  valor_dinheiro: number | null;
  valor_pix: number | null;
  valor_cartao_credito: number | null;
  valor_cartao_debito: number | null;
  valor_padrao: number | null;
  duracao_minutos: number | null;
};

function AutoatendimentoPage() {
  const navigate = useNavigate();
  const { clinicaAtual, loading } = useClinica();

  const [step, setStep] = useState<Hub>("home");
  const [identMode, setIdentMode] = useState<IdentMode>(null);
  const [cpf, setCpf] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState("Posicione seu rosto");
  const [pacienteAtual, setPacienteAtual] = useState<{ id: string; nome: string } | null>(null);
  const [agendamentoCheckin, setAgendamentoCheckin] = useState<{
    id: string;
    medico?: string | null;
    procedimento?: string | null;
    inicio: string;
  } | null>(null);
  const [senhaEmitida, setSenhaEmitida] = useState<string | null>(null);
  const [especialidades, setEspecialidades] = useState<{ id: string; nome: string }[]>([]);
  const [especialidadeSel, setEspecialidadeSel] = useState<string | null>(null);
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [vagaSel, setVagaSel] = useState<Vaga | null>(null);
  const [procInfo, setProcInfo] = useState<ProcInfo | null>(null);
  const [formaPagto, setFormaPagto] = useState<FormaPagto | null>(null);
  const [valorFinal, setValorFinal] = useState<number | null>(null);
  const [checkoutInfo, setCheckoutInfo] = useState<{
    medico: string;
    hora: string;
    forma: string;
    valor: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    void ensureFaceModels().catch(() => {});
  }, []);

  // Auto-volta para home após 12s nas telas de sucesso
  useEffect(() => {
    if (step !== "ok-checkin" && step !== "ok-agendar") return;
    const t = setTimeout(reset, 12000);
    return () => clearTimeout(t);
  }, [step]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function reset() {
    stopCamera();
    setStep("home");
    setIdentMode(null);
    setCpf("");
    setPacienteAtual(null);
    setAgendamentoCheckin(null);
    setSenhaEmitida(null);
    setEspecialidadeSel(null);
    setVagas([]);
    setVagaSel(null);
    setProcInfo(null);
    setFormaPagto(null);
    setValorFinal(null);
    setCheckoutInfo(null);
  }

  // -------- Identificação --------
  async function identificarPorCpf(): Promise<{ id: string; nome: string } | null> {
    if (!clinicaAtual) return null;
    const limpo = cpf.replace(/\D/g, "");
    if (limpo.length !== 11) {
      toast.error("CPF inválido");
      return null;
    }
    const { data, error } = await supabase
      .from("pacientes")
      .select("id, nome")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("cpf", limpo)
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return null;
    }
    if (!data) {
      toast.error("Paciente não encontrado. Procure a recepção.");
      return null;
    }
    setPacienteAtual(data);
    return data;
  }

  async function iniciarFacial(onMatch: (p: { id: string; nome: string }) => void) {
    if (!clinicaAtual) return;
    setScanMsg("Carregando câmera…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanMsg("Posicione seu rosto e fique parado…");
      await ensureFaceModels();

      const { data: bios } = await supabase
        .from("paciente_biometria")
        .select("paciente_id, descriptor, pacientes!inner(nome)")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .is("revogado_em", null);

      const ativas: { paciente_id: string; nome: string; descriptor: number[] }[] = (bios ?? [])
        .map((b: any) => ({
          paciente_id: b.paciente_id,
          nome: b.pacientes?.nome ?? "",
          descriptor: Array.isArray(b.descriptor) ? b.descriptor : [],
        }))
        .filter((b) => b.descriptor.length === 128);

      let descritor: Float32Array | null = null;
      for (let i = 0; i < 12; i++) {
        if (!videoRef.current || !streamRef.current) return;
        descritor = await detectDescriptor(videoRef.current);
        if (descritor) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!descritor) {
        setScanMsg("Rosto não detectado. Tente o CPF.");
        stopCamera();
        return;
      }
      let melhor: { paciente_id: string; nome: string; dist: number } | null = null;
      for (const bio of ativas) {
        const d = euclidean(descritor, bio.descriptor);
        if (!melhor || d < melhor.dist) melhor = { paciente_id: bio.paciente_id, nome: bio.nome, dist: d };
      }
      stopCamera();
      if (melhor && melhor.dist <= FACE_MATCH_THRESHOLD) {
        setScanMsg(`Olá, ${melhor.nome}!`);
        const p = { id: melhor.paciente_id, nome: melhor.nome };
        setPacienteAtual(p);
        onMatch(p);
      } else {
        setScanMsg("Não reconhecemos seu rosto. Use o CPF.");
      }
    } catch {
      toast.error("Não foi possível acessar a câmera");
      stopCamera();
    }
  }

  // -------- Check-in --------
  async function fazerCheckin(paciente: { id: string; nome: string }) {
    if (!clinicaAtual) return;
    setBusy(true);
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date();
    fim.setHours(23, 59, 59, 999);

    const { data: ags, error } = await supabase
      .from("agendamentos")
      .select("id, inicio, procedimento, fluxo_etapa, medicos(nome)")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("paciente_id", paciente.id)
      .gte("inicio", inicio.toISOString())
      .lte("inicio", fim.toISOString())
      .order("inicio")
      .limit(1);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!ags || ags.length === 0) {
      toast.error("Sem agendamento para hoje. Procure a recepção.");
      return;
    }
    const a = ags[0] as any;
    setAgendamentoCheckin({
      id: a.id,
      medico: a.medicos?.nome ?? null,
      procedimento: a.procedimento ?? null,
      inicio: a.inicio,
    });

    if (a.fluxo_etapa !== "triagem" && a.fluxo_etapa !== "atendimento") {
      await supabase
        .from("agendamentos")
        .update({ fluxo_etapa: "recepcao" })
        .eq("id", a.id);
    }
    setStep("ok-checkin");
  }

  // -------- Solicitar agendamento (gera senha N) --------
  async function carregarEspecialidades() {
    if (!clinicaAtual) return;
    const { data } = await supabase
      .from("especialidades")
      .select("id, nome")
      .order("nome");
    const filtradas = (data ?? []).filter((e) => {
      const n = (e.nome || "").toUpperCase();
      return !n.includes("CARTAO") && !n.includes("CARTÃO") && !n.includes("SEGURO");
    });
    setEspecialidades(filtradas);
  }

  async function solicitarAgendamento(paciente: { id: string; nome: string } | null) {
    if (!clinicaAtual) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("emitir_senha", {
      _clinica_id: clinicaAtual.clinica_id,
      _tipo: "N",
      _paciente_id: paciente?.id,
      _identificado_facial: identMode === "facial",
    });
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message ?? "Erro ao emitir senha");
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setSenhaEmitida(row.codigo);
    setStep("ok-agendar");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!clinicaAtual) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-semibold">Nenhuma clínica selecionada</h1>
          <p className="text-muted-foreground">
            Faça login no painel administrativo e selecione a clínica antes de abrir o totem.
          </p>
          <Button onClick={() => navigate({ to: "/app" })}>Ir para o painel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40 flex flex-col">
      <header className="px-8 py-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Bem-vindo a</div>
          <h1 className="text-2xl font-bold">{clinicaAtual.clinica.nome}</h1>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div className="capitalize">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </div>
          <div className="text-2xl font-mono tabular-nums text-foreground">
            <Clock />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        {step === "home" && (
          <div className="w-full max-w-6xl space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-5xl font-bold tracking-tight">Como podemos ajudar?</h2>
              <p className="text-xl text-muted-foreground">Toque em uma das opções</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <TileGrande
                onClick={() => navigate({ to: "/totem" })}
                cor="from-primary/90 to-primary"
                Icon={Ticket}
                titulo="Retirar senha"
                sub="Comum, preferencial, retorno ou prioridade médica"
              />
              <TileGrande
                onClick={() => {
                  setStep("checkin");
                  setIdentMode(null);
                }}
                cor="from-emerald-600 to-emerald-700"
                Icon={BadgeCheck}
                titulo="Fazer check-in"
                sub="Confirme presença na sua consulta de hoje"
              />
              <TileGrande
                onClick={() => {
                  setStep("agendar");
                  setIdentMode(null);
                  void carregarEspecialidades();
                }}
                cor="from-indigo-600 to-indigo-700"
                Icon={CalendarPlus}
                titulo="Solicitar atendimento"
                sub="Escolha a especialidade e seja chamado"
              />
            </div>
            <p className="text-center text-xs text-muted-foreground pt-4">
              Em caso de emergência, dirija-se imediatamente à recepção.
            </p>
          </div>
        )}

        {(step === "checkin" || step === "agendar") && (
          <div className="w-full max-w-3xl bg-card border rounded-3xl p-10 shadow-xl relative">
            <button
              onClick={reset}
              className="absolute top-6 left-6 text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ArrowLeft className="h-5 w-5" /> Início
            </button>

            <div className="text-center space-y-2 mb-8">
              <h2 className="text-3xl font-bold">
                {step === "checkin" ? "Identifique-se para check-in" : "Identifique-se"}
              </h2>
              <p className="text-muted-foreground">Escolha como deseja se identificar</p>
            </div>

            {/* Escolha do modo */}
            {identMode === null && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => setIdentMode("cpf")}
                  className="h-32 rounded-2xl border-2 hover:border-primary hover:bg-primary/5 transition flex flex-col items-center justify-center gap-2"
                >
                  <ShieldCheck className="h-8 w-8 text-primary" />
                  <div className="text-lg font-semibold">Digitar CPF</div>
                </button>
                <button
                  onClick={() => {
                    setIdentMode("facial");
                    void iniciarFacial((p) => {
                      if (step === "checkin") void fazerCheckin(p);
                    });
                  }}
                  className="h-32 rounded-2xl border-2 hover:border-primary hover:bg-primary/5 transition flex flex-col items-center justify-center gap-2"
                >
                  <Camera className="h-8 w-8 text-primary" />
                  <div className="text-lg font-semibold">Reconhecimento facial</div>
                </button>
              </div>
            )}

            {/* CPF */}
            {identMode === "cpf" && (
              <div className="space-y-5">
                <input
                  autoFocus
                  inputMode="numeric"
                  placeholder="Digite seu CPF (apenas números)"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  className="w-full h-20 px-6 text-3xl tracking-widest rounded-xl border bg-background text-center"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" size="lg" className="h-14" onClick={() => setIdentMode(null)}>
                    Voltar
                  </Button>
                  <Button
                    size="lg"
                    className="h-14"
                    disabled={busy || cpf.length !== 11}
                    onClick={async () => {
                      const p = await identificarPorCpf();
                      if (!p) return;
                      if (step === "checkin") await fazerCheckin(p);
                    }}
                  >
                    {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Continuar
                  </Button>
                </div>
              </div>
            )}

            {/* Facial */}
            {identMode === "facial" && (
              <div className="text-center space-y-4">
                <div className="relative mx-auto w-[420px] h-[320px] rounded-2xl overflow-hidden border-4 border-primary/40 bg-black">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover scale-x-[-1]"
                    playsInline
                    muted
                  />
                  <div className="absolute inset-8 border-2 border-white/60 rounded-full pointer-events-none" />
                </div>
                <p className="text-lg">{scanMsg}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    stopCamera();
                    setIdentMode(null);
                  }}
                >
                  <X className="h-4 w-4 mr-2" /> Cancelar
                </Button>
              </div>
            )}

            {/* Etapa 2 do agendamento — escolher especialidade após identificar */}
            {step === "agendar" && pacienteAtual && identMode !== null && (
              <div className="mt-10 space-y-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Olá,</p>
                  <p className="text-xl font-semibold">{pacienteAtual.nome}</p>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Escolha a especialidade desejada
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-72 overflow-auto">
                  {especialidades.length === 0 && (
                    <div className="col-span-3 text-center text-muted-foreground py-4">
                      Nenhuma especialidade cadastrada
                    </div>
                  )}
                  {especialidades.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setEspecialidadeSel(e.id)}
                      className={`h-20 rounded-xl border-2 text-sm font-medium px-3 transition ${
                        especialidadeSel === e.id
                          ? "border-primary bg-primary/10"
                          : "hover:border-primary/50"
                      }`}
                    >
                      {e.nome}
                    </button>
                  ))}
                </div>
                <Button
                  size="lg"
                  className="w-full h-14"
                  disabled={busy || !especialidadeSel}
                  onClick={() => solicitarAgendamento(pacienteAtual)}
                >
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Confirmar e pegar senha
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "ok-checkin" && agendamentoCheckin && (
          <div className="text-center space-y-6 max-w-2xl">
            <CheckCircle2 className="h-24 w-24 text-emerald-500 mx-auto" />
            <h2 className="text-4xl font-bold">Check-in confirmado!</h2>
            {pacienteAtual && <p className="text-2xl">Olá, {pacienteAtual.nome}</p>}
            <div className="bg-card border rounded-2xl p-6 text-left space-y-2">
              <div>
                <span className="text-muted-foreground text-sm">Horário: </span>
                <span className="text-lg font-semibold">
                  {new Date(agendamentoCheckin.inicio).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {agendamentoCheckin.medico && (
                <div>
                  <span className="text-muted-foreground text-sm">Profissional: </span>
                  <span className="text-lg">{agendamentoCheckin.medico}</span>
                </div>
              )}
              {agendamentoCheckin.procedimento && (
                <div>
                  <span className="text-muted-foreground text-sm">Procedimento: </span>
                  <span className="text-lg">{agendamentoCheckin.procedimento}</span>
                </div>
              )}
            </div>
            <p className="text-muted-foreground">Aguarde sua chamada no painel.</p>
            <Button size="lg" onClick={reset}>
              Concluir
            </Button>
          </div>
        )}

        {step === "ok-agendar" && senhaEmitida && (
          <div className="text-center space-y-4">
            <div className="text-muted-foreground uppercase tracking-widest text-sm">Sua senha</div>
            <div className="text-[10rem] leading-none font-black text-primary tabular-nums">
              {senhaEmitida}
            </div>
            <p className="text-xl">A recepção irá chamar você para confirmar o horário.</p>
            <Button size="lg" onClick={reset}>
              Concluir
            </Button>
          </div>
        )}
      </main>

      <footer className="px-8 py-4 text-center text-xs text-muted-foreground">
        ClinicaOS · Autoatendimento
        {step !== "home" && (
          <button onClick={reset} className="underline ml-2">
            Voltar ao início
          </button>
        )}
      </footer>
    </div>
  );
}

function TileGrande({
  onClick,
  cor,
  Icon,
  titulo,
  sub,
}: {
  onClick: () => void;
  cor: string;
  Icon: typeof Ticket;
  titulo: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden rounded-3xl p-8 text-left text-white bg-gradient-to-br ${cor} shadow-lg hover:shadow-2xl transition-all active:scale-[0.98] min-h-[260px] flex flex-col justify-between`}
    >
      <Icon className="h-14 w-14" />
      <div>
        <div className="text-2xl font-bold">{titulo}</div>
        <div className="text-white/85 text-sm mt-1">{sub}</div>
      </div>
      <Icon className="absolute -right-6 -bottom-6 h-40 w-40 opacity-10" />
    </button>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span>--:--</span>;
  return <span>{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>;
}
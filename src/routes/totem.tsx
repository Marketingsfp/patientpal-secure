import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClinicaProvider, useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Accessibility, Stethoscope, Hash, RotateCcw, Camera, ShieldCheck, X, ArrowLeft, Loader2 } from "lucide-react";
import { detectDescriptor, ensureFaceModels, euclidean, FACE_MATCH_THRESHOLD } from "@/lib/face-recognition";

export const Route = createFileRoute("/totem")({
  component: TotemRoute,
});

function TotemRoute() {
  return (
    <ClinicaProvider>
      <TotemPage />
    </ClinicaProvider>
  );
}

type TipoSenha = "N" | "P" | "E" | "R";

const TIPOS: { tipo: TipoSenha; titulo: string; sub: string; Icon: typeof Hash; classe: string }[] = [
  { tipo: "N", titulo: "Comum", sub: "Atendimento padrão", Icon: Hash, classe: "from-primary/90 to-primary" },
  { tipo: "P", titulo: "Preferencial", sub: "Idoso · Gestante · PCD · Crianças de colo", Icon: Accessibility, classe: "from-amber-500 to-amber-600" },
  { tipo: "E", titulo: "Prioridade médica", sub: "Urgência / encaixe", Icon: Stethoscope, classe: "from-rose-600 to-rose-700" },
  { tipo: "R", titulo: "Retorno", sub: "Pacientes em retorno", Icon: RotateCcw, classe: "from-emerald-600 to-emerald-700" },
];

type Step = "home" | "consent" | "scan" | "manual" | "ticket";

function TotemPage() {
  const navigate = useNavigate();
  const { clinicaAtual, loading } = useClinica();
  const [step, setStep] = useState<Step>("home");
  const [tipo, setTipo] = useState<TipoSenha | null>(null);
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<{ codigo: string; tipo: TipoSenha; identificado: boolean; nome?: string | null } | null>(null);
  const [scanMsg, setScanMsg] = useState("Posicione seu rosto na câmera");
  const [manual, setManual] = useState({ nome: "", cpf: "", telefone: "" });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Auto-volta para home depois de 12s mostrando o ticket
  useEffect(() => {
    if (step !== "ticket") return;
    const t = setTimeout(() => reset(), 12000);
    return () => clearTimeout(t);
  }, [step]);

  // Pre-carrega modelos em segundo plano
  useEffect(() => { void ensureFaceModels().catch(() => {}); }, []);

  function reset() {
    stopCamera();
    setTipo(null);
    setTicket(null);
    setStep("home");
    setManual({ nome: "", cpf: "", telefone: "" });
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function emitir(_tipo: TipoSenha, pacienteId?: string, identificado = false): Promise<void> {
    if (!clinicaAtual) {
      toast.error("Nenhuma clínica selecionada");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("emitir_senha", {
      _clinica_id: clinicaAtual.clinica_id,
      _tipo,
      _paciente_id: pacienteId,
      _identificado_facial: identificado,
    });
    setBusy(false);
    if (error || !data) {
      mostrarErro(error);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setTicket({ codigo: row.codigo, tipo: _tipo, identificado });
    setStep("ticket");
    stopCamera();
  }

  function escolherTipo(t: TipoSenha) {
    setTipo(t);
    setStep("consent");
  }

  async function iniciarCamera() {
    setStep("scan");
    setScanMsg("Carregando câmera…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanMsg("Posicione seu rosto e mantenha-se imóvel…");
      await reconhecerLoop();
    } catch {
      toast.error("Não foi possível acessar a câmera");
      setStep("consent");
    }
  }

  async function reconhecerLoop() {
    if (!clinicaAtual || !tipo || !videoRef.current) return;
    await ensureFaceModels();
    setScanMsg("Detectando rosto…");

    // Carrega biometrias ativas da clínica
    const { data: bios } = await supabase
      .from("paciente_biometria")
      .select("paciente_id, descriptor, pacientes!inner(nome)")
      .eq("clinica_id", clinicaAtual.clinica_id)
      .is("revogado_em", null);

    const ativas: { paciente_id: string; nome: string; descriptor: number[] }[] =
      (bios ?? []).map((b: any) => ({
        paciente_id: b.paciente_id,
        nome: b.pacientes?.nome ?? "",
        descriptor: Array.isArray(b.descriptor) ? b.descriptor : [],
      })).filter((b) => b.descriptor.length === 128);

    // Tenta detectar até 10 vezes (~5s)
    let descritor: Float32Array | null = null;
    for (let i = 0; i < 10; i++) {
      if (!videoRef.current || !streamRef.current) return;
      descritor = await detectDescriptor(videoRef.current);
      if (descritor) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!descritor) {
      setScanMsg("Rosto não detectado");
      // Cadastra sem foto: pede manual
      stopCamera();
      setStep("manual");
      return;
    }

    // Procura match
    let melhor: { paciente_id: string; nome: string; dist: number } | null = null;
    for (const bio of ativas) {
      const d = euclidean(descritor, bio.descriptor);
      if (!melhor || d < melhor.dist) melhor = { paciente_id: bio.paciente_id, nome: bio.nome, dist: d };
    }

    if (melhor && melhor.dist <= FACE_MATCH_THRESHOLD) {
      setScanMsg(`Olá, ${melhor.nome}!`);
      await emitir(tipo, melhor.paciente_id, true);
      setTicket((prev) => prev ? { ...prev, nome: melhor!.nome } : prev);
      return;
    }

    // Não achou: cadastra novo paciente e biometria
    stopCamera();
    setManual({ nome: "", cpf: "", telefone: "" });
    setStep("manual");
    // Guarda descritor temporariamente
    (window as any).__totem_descriptor = Array.from(descritor);
  }

  async function concluirManual(e: React.FormEvent) {
    e.preventDefault();
    if (!clinicaAtual || !tipo) return;
    const nome = manual.nome.trim();
    if (nome.length < 2) {
      toast.error("Informe o nome completo");
      return;
    }
    setBusy(true);

    let pacienteId: string | undefined;
    // Tenta achar por CPF
    if (manual.cpf.trim().length >= 11) {
      const { data: existente } = await supabase
        .from("pacientes")
        .select("id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("cpf", manual.cpf.trim())
        .maybeSingle();
      pacienteId = existente?.id;
    }

    if (!pacienteId) {
      const { data: novo, error } = await supabase
        .from("pacientes")
        .insert({
          clinica_id: clinicaAtual.clinica_id,
          nome,
          cpf: manual.cpf.trim() || null,
          telefone: manual.telefone.trim() || null,
          consentimento_lgpd_em: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !novo) {
        setBusy(false);
        mostrarErro(error);
        return;
      }
      pacienteId = novo.id;
    }

    // Salva biometria se houver descritor
    const desc = (window as any).__totem_descriptor as number[] | undefined;
    if (desc && pacienteId) {
      await supabase.from("paciente_biometria").insert({
        clinica_id: clinicaAtual.clinica_id,
        paciente_id: pacienteId,
        descriptor: desc,
      });
      delete (window as any).__totem_descriptor;
    }

    setBusy(false);
    await emitir(tipo, pacienteId, !!desc);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando totem…</p>
        </div>
      </div>
    );
  }

  if (!clinicaAtual) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-semibold">Nenhuma clínica selecionada</h1>
          <p className="text-muted-foreground">Faça login no painel administrativo e selecione a clínica antes de abrir o totem.</p>
          <Button onClick={() => navigate({ to: "/app" })}>Ir para o painel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40 flex flex-col">
      {/* Header */}
      <header className="px-8 py-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Bem-vindo a</div>
          <h1 className="text-2xl font-bold">{clinicaAtual.clinica.nome}</h1>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div>{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</div>
          <div className="text-2xl font-mono tabular-nums text-foreground"><Clock /></div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-8 pb-12">
        {step === "home" && (
          <div className="w-full max-w-5xl space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-bold tracking-tight">Retire sua senha</h2>
              <p className="text-lg text-muted-foreground">Toque na opção desejada</p>
            </div>
            <div className="grid grid-cols-2 gap-6">
              {TIPOS.map(({ tipo: t, titulo, sub, Icon, classe }) => (
                <button
                  key={t}
                  onClick={() => escolherTipo(t)}
                  className={`group relative overflow-hidden rounded-2xl p-8 text-left text-white bg-gradient-to-br ${classe} shadow-lg hover:shadow-2xl transition-all active:scale-[0.98]`}
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="text-3xl font-bold">{titulo}</div>
                      <div className="text-white/85 text-sm">{sub}</div>
                    </div>
                    <div className="text-6xl font-black opacity-90">{t}</div>
                  </div>
                  <Icon className="absolute -right-4 -bottom-4 h-32 w-32 opacity-10" />
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "consent" && tipo && (
          <div className="max-w-2xl w-full bg-card border rounded-2xl p-10 space-y-6 shadow-xl">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-primary" />
              <h2 className="text-2xl font-bold">Identificação opcional</h2>
            </div>
            <div className="space-y-3 text-muted-foreground">
              <p>
                Podemos usar o reconhecimento facial para identificar você mais rápido nas
                próximas visitas. A imagem <strong>não é armazenada</strong> — apenas um código
                matemático do rosto (vetor) fica salvo, criptografado, e pode ser removido a qualquer momento.
              </p>
              <p className="text-sm">
                Base legal: <strong>consentimento</strong> do titular (LGPD art. 11, II, "a").
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <Button size="lg" variant="outline" className="h-16 text-base" onClick={() => { setStep("manual"); }}>
                Sem identificação
              </Button>
              <Button size="lg" className="h-16 text-base" onClick={iniciarCamera}>
                <Camera className="h-5 w-5 mr-2" /> Aceitar e usar a câmera
              </Button>
            </div>
            <button onClick={() => emitir(tipo)} className="mx-auto block text-sm text-muted-foreground underline">
              Pular tudo e só emitir a senha
            </button>
            <button onClick={reset} className="absolute top-6 left-6 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5 inline mr-1" /> Voltar
            </button>
          </div>
        )}

        {step === "scan" && (
          <div className="max-w-xl w-full text-center space-y-6">
            <div className="relative mx-auto w-[480px] h-[360px] rounded-2xl overflow-hidden border-4 border-primary/40 bg-black">
              <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" playsInline muted />
              <div className="absolute inset-8 border-2 border-white/60 rounded-full pointer-events-none" />
            </div>
            <p className="text-lg">{scanMsg}</p>
            <Button variant="outline" onClick={() => { stopCamera(); setStep("consent"); }}>
              <X className="h-4 w-4 mr-2" /> Cancelar
            </Button>
          </div>
        )}

        {step === "manual" && tipo && (
          <form onSubmit={concluirManual} className="max-w-md w-full bg-card border rounded-2xl p-8 space-y-5 shadow-xl">
            <h2 className="text-2xl font-bold">Seus dados</h2>
            <p className="text-sm text-muted-foreground">Preencha para personalizar seu atendimento (opcional, exceto o nome).</p>
            <div className="space-y-3">
              <input
                autoFocus
                placeholder="Nome completo"
                value={manual.nome}
                onChange={(e) => setManual({ ...manual, nome: e.target.value })}
                maxLength={200}
                className="w-full h-14 px-4 text-lg rounded-lg border bg-background"
              />
              <input
                placeholder="CPF (opcional)"
                value={manual.cpf}
                onChange={(e) => setManual({ ...manual, cpf: e.target.value.replace(/\D/g, "").slice(0, 11) })}
                inputMode="numeric"
                className="w-full h-14 px-4 text-lg rounded-lg border bg-background"
              />
              <input
                placeholder="Telefone (opcional)"
                value={manual.telefone}
                onChange={(e) => setManual({ ...manual, telefone: e.target.value })}
                maxLength={30}
                className="w-full h-14 px-4 text-lg rounded-lg border bg-background"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" size="lg" onClick={reset}>Cancelar</Button>
              <Button type="submit" size="lg" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Emitir senha
              </Button>
            </div>
          </form>
        )}

        {step === "ticket" && ticket && (
          <div className="text-center space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="text-muted-foreground uppercase tracking-widest text-sm">Sua senha</div>
            <div className="text-[12rem] leading-none font-black text-primary tabular-nums">{ticket.codigo}</div>
            <div className="text-2xl">
              {ticket.identificado && ticket.nome ? `Bem-vindo de volta, ${ticket.nome}!` : "Aguarde sua chamada"}
            </div>
            <p className="text-muted-foreground">Acompanhe o painel de chamada na sala de espera.</p>
            <Button size="lg" onClick={reset}>Concluir</Button>
          </div>
        )}
      </main>

      <footer className="px-8 py-4 text-center text-xs text-muted-foreground">
        ClinicaOS · Totem v1 · {step !== "home" && (
          <button onClick={reset} className="underline ml-2">Voltar ao início</button>
        )}
      </footer>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>;
}
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClinicaProvider, useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
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
import { TecladoNumerico, formatarCpfParcial } from "@/components/totem/teclado-numerico";

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

const FORMA_LABEL: Record<FormaPagto, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
};

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
      mostrarErro(error);
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
      mostrarErro(error);
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

  // -------- Vagas disponíveis hoje --------
  async function carregarVagasHoje(especialidadeId: string) {
    if (!clinicaAtual) return;
    setBusy(true);
    try {
      // 1) Médicos da especialidade
      const { data: meRows } = await supabase
        .from("medico_especialidades")
        .select("medico_id")
        .eq("especialidade_id", especialidadeId);
      const medicoIdsEsp = (meRows ?? []).map((r: any) => r.medico_id);
      const { data: medsBase } = await supabase
        .from("medicos")
        .select("id, nome, duracao_consulta_min, especialidade_id")
        .eq("clinica_id", clinicaAtual.clinica_id)
        .eq("ativo", true);
      const meds = (medsBase ?? []).filter(
        (m: any) => medicoIdsEsp.includes(m.id) || m.especialidade_id === especialidadeId,
      );
      if (meds.length === 0) {
        setVagas([]);
        setStep("vagas");
        return;
      }
      const medicoIds = meds.map((m: any) => m.id);

      // 2) Disponibilidades de hoje
      const hoje = new Date();
      const diaSemana = hoje.getDay();
      const yyyy = hoje.getFullYear();
      const mm = String(hoje.getMonth() + 1).padStart(2, "0");
      const dd = String(hoje.getDate()).padStart(2, "0");
      const hojeStr = `${yyyy}-${mm}-${dd}`;
      const inicioDia = new Date();
      inicioDia.setHours(0, 0, 0, 0);
      const fimDia = new Date();
      fimDia.setHours(23, 59, 59, 999);

      const { data: disps } = await supabase
        .from("medico_disponibilidades")
        .select("medico_id, dia_semana, hora_inicio, hora_fim, intervalo_min, ativo, agenda_id, vigencia_inicio, vigencia_fim")
        .in("medico_id", medicoIds)
        .eq("dia_semana", diaSemana)
        .eq("ativo", true);

      const dispsValidas = (disps ?? []).filter((d: any) => {
        if (d.vigencia_inicio && d.vigencia_inicio > hojeStr) return false;
        if (d.vigencia_fim && d.vigencia_fim < hojeStr) return false;
        return true;
      });

      // 3) Agendamentos já existentes hoje
      const { data: ags } = await supabase
        .from("agendamentos")
        .select("medico_id, inicio, status")
        .in("medico_id", medicoIds)
        .gte("inicio", inicioDia.toISOString())
        .lte("inicio", fimDia.toISOString())
        .neq("status", "cancelado");
      const ocupados = new Set(
        (ags ?? []).map((a: any) => `${a.medico_id}|${new Date(a.inicio).getTime()}`),
      );

      // 4) Gera slots futuros
      const agora = new Date();
      const lista: Vaga[] = [];
      for (const d of dispsValidas) {
        const med = meds.find((m: any) => m.id === d.medico_id);
        if (!med) continue;
        const dur = d.intervalo_min || med.duracao_consulta_min || 30;
        const [h1, m1] = d.hora_inicio.split(":").map(Number);
        const [h2, m2] = d.hora_fim.split(":").map(Number);
        const t0 = new Date();
        t0.setHours(h1, m1, 0, 0);
        const tEnd = new Date();
        tEnd.setHours(h2, m2, 0, 0);
        for (let t = new Date(t0); t < tEnd; t = new Date(t.getTime() + dur * 60000)) {
          if (t < agora) continue;
          const fim = new Date(t.getTime() + dur * 60000);
          if (ocupados.has(`${d.medico_id}|${t.getTime()}`)) continue;
          lista.push({
            medico_id: d.medico_id,
            medico_nome: med.nome,
            agenda_id: d.agenda_id ?? null,
            inicio: t.toISOString(),
            fim: fim.toISOString(),
            hora_label: t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          });
        }
      }
      lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
      setVagas(lista);
      setStep("vagas");
    } finally {
      setBusy(false);
    }
  }

  async function carregarProcedimento(especialidadeId: string) {
    if (!clinicaAtual) return null;
    const esp = especialidades.find((e) => e.id === especialidadeId);
    const nomeEsp = esp?.nome ?? "";
    // Procura procedimento por nome da especialidade ou "consulta"
    const { data } = await supabase
      .from("procedimentos")
      .select(
        "id, nome, valor_padrao, valor_dinheiro, valor_pix, valor_cartao_credito, valor_cartao_debito, duracao_minutos",
      )
      .eq("clinica_id", clinicaAtual.clinica_id)
      .eq("ativo", true)
      .or(`nome.ilike.%${nomeEsp}%,nome.ilike.%consulta%`)
      .order("nome")
      .limit(20);
    const list = data ?? [];
    // Prioriza match por nome exato da especialidade
    const exato = list.find((p: any) =>
      (p.nome || "").toLowerCase().includes(nomeEsp.toLowerCase()),
    );
    const escolhido = exato ?? list[0] ?? null;
    setProcInfo(escolhido as any);
    return escolhido as any;
  }

  function valorPorForma(p: ProcInfo | null, f: FormaPagto): number {
    if (!p) return 0;
    const map: Record<FormaPagto, number | null | undefined> = {
      dinheiro: p.valor_dinheiro,
      pix: p.valor_pix,
      cartao_credito: p.valor_cartao_credito,
      cartao_debito: p.valor_cartao_debito,
    };
    const v = map[f];
    return v ?? p.valor_padrao ?? 0;
  }

  async function confirmarAgendamentoECaixa(paciente: { id: string; nome: string } | null) {
    if (!clinicaAtual || !paciente || !vagaSel || !procInfo || !formaPagto) return;
    setBusy(true);
    const valor = valorPorForma(procInfo, formaPagto);
    const formaLabel = FORMA_LABEL[formaPagto];
    const obs = `[Totem] Forma de pagamento: ${formaLabel} — R$ ${valor
      .toFixed(2)
      .replace(".", ",")}`;
    const { error: errAg } = await supabase.from("agendamentos").insert({
      clinica_id: clinicaAtual.clinica_id,
      paciente_id: paciente.id,
      paciente_nome: paciente.nome,
      medico_id: vagaSel.medico_id,
      inicio: vagaSel.inicio,
      fim: vagaSel.fim,
      procedimento: procInfo.nome,
      status: "agendado",
      fluxo_etapa: "caixa",
      agenda_id: vagaSel.agenda_id,
      observacoes: obs,
    });
    if (errAg) {
      setBusy(false);
      mostrarErro(errAg);
      return;
    }
    const { data: senhaData, error: errSenha } = await supabase.rpc("emitir_senha", {
      _clinica_id: clinicaAtual.clinica_id,
      _tipo: "N",
      _paciente_id: paciente.id,
      _identificado_facial: identMode === "facial",
    });
    setBusy(false);
    if (errSenha || !senhaData) {
      mostrarErro(errSenha);
      return;
    }
    const row = Array.isArray(senhaData) ? senhaData[0] : senhaData;
    setSenhaEmitida(row.codigo);
    setValorFinal(valor);
    setCheckoutInfo({
      medico: vagaSel.medico_nome,
      hora: vagaSel.hora_label,
      forma: formaLabel,
      valor,
    });
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
    // h-[100dvh] + overflow-hidden: modo quiosque, sem scroll — cada tela
    // precisa caber inteira na viewport do totem.
    <div className="h-[100dvh] overflow-hidden bg-gradient-to-br from-background via-background to-muted/40 flex flex-col">
      <header className="px-6 py-3 flex items-center justify-between shrink-0">
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

      <main className="flex-1 min-h-0 flex items-center justify-center px-6 py-2 overflow-hidden">
        {step === "home" && (
          <div className="w-full max-w-6xl space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-5xl font-bold tracking-tight">Como podemos ajudar?</h2>
              <p className="text-xl text-muted-foreground">Toque em uma das opções</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                // Entra direto no CPF; o paciente pode alternar para
                // reconhecimento facial pelo botão dentro da tela.
                  setIdentMode("cpf");
                  setCpf("");
                }}
                cor="from-emerald-600 to-emerald-700"
                Icon={BadgeCheck}
                titulo="Fazer check-in"
                sub="Confirme presença na sua consulta de hoje"
              />
            </div>
            <p className="text-center text-xs text-muted-foreground pt-4">
              Em caso de emergência, dirija-se imediatamente à recepção.
            </p>
          </div>
        )}

        {(step === "checkin" || step === "agendar") && (
          <div className="w-full max-w-xl bg-card border rounded-3xl p-6 shadow-xl relative my-auto max-h-full flex flex-col">
            <button
              onClick={reset}
              className="absolute top-4 left-4 text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
            >
              <ArrowLeft className="h-4 w-4" /> Início
            </button>

            <div className="text-center space-y-1 mb-4 mt-2">
              <h2 className="text-2xl font-bold">
                {step === "checkin" ? "Check-in" : "Identifique-se"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {identMode === "facial"
                  ? "Posicione seu rosto na câmera"
                  : "Digite seu CPF no teclado abaixo"}
              </p>
            </div>

            {/* Escolha do modo — mantido apenas como fallback (o check-in já
                entra direto no CPF; o botão de reconhecimento facial foi
                removido a pedido da gestão). */}
            {identMode === null && (
              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => setIdentMode("cpf")}
                  className="h-32 rounded-2xl border-2 hover:border-primary hover:bg-primary/5 transition flex flex-col items-center justify-center gap-2"
                >
                  <ShieldCheck className="h-8 w-8 text-primary" />
                  <div className="text-lg font-semibold">Digitar CPF</div>
                </button>
              </div>
            )}

            {/* CPF — input somente leitura + teclado na tela (totem touch,
                sem teclado físico; inputMode none evita o teclado do SO). */}
            {identMode === "cpf" && (
              <div className="space-y-3">
                <input
                  readOnly
                  inputMode="none"
                  placeholder="000.000.000-00"
                  value={formatarCpfParcial(cpf)}
                  className="w-full h-14 px-4 text-2xl tracking-widest rounded-xl border bg-background text-center tabular-nums"
                />
                <TecladoNumerico
                  disabled={busy}
                  onDigit={(d) => setCpf((v) => (v + d).slice(0, 11))}
                  onBackspace={() => setCpf((v) => v.slice(0, -1))}
                  onClear={() => setCpf("")}
                />
                <Button
                  variant="outline"
                  className="w-full h-11"
                  disabled={busy}
                  onClick={() => {
                    setIdentMode("facial");
                    void iniciarFacial(async (p) => {
                      if (step === "checkin") await fazerCheckin(p);
                    });
                  }}
                >
                  <Camera className="h-4 w-4 mr-2" /> Usar reconhecimento facial
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-11" onClick={reset}>
                    Voltar
                  </Button>
                  <Button
                    className="h-11"
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
              <div className="text-center space-y-3">
                <div className="relative mx-auto w-full max-w-[360px] aspect-[4/3] rounded-2xl overflow-hidden border-4 border-primary/40 bg-black">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover scale-x-[-1]"
                    playsInline
                    muted
                  />
                  <div className="absolute inset-6 border-2 border-white/60 rounded-full pointer-events-none" />
                </div>
                <p className="text-base">{scanMsg}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="h-11"
                    onClick={() => {
                      stopCamera();
                      setIdentMode("cpf");
                    }}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" /> Digitar CPF
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11"
                    onClick={() => {
                      stopCamera();
                      reset();
                    }}
                  >
                    <X className="h-4 w-4 mr-2" /> Cancelar
                  </Button>
                </div>
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
                  onClick={async () => {
                    if (!especialidadeSel) return;
                    await carregarProcedimento(especialidadeSel);
                    await carregarVagasHoje(especialidadeSel);
                  }}
                >
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Ver horários disponíveis
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

        {step === "vagas" && (
          <div className="w-full max-w-4xl bg-card border rounded-3xl p-10 shadow-xl relative">
            <button
              onClick={reset}
              className="absolute top-6 left-6 text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ArrowLeft className="h-5 w-5" /> Início
            </button>
            <div className="text-center space-y-2 mb-6">
              <h2 className="text-3xl font-bold">Escolha um horário</h2>
              <p className="text-muted-foreground">Vagas disponíveis para hoje</p>
            </div>
            {vagas.length === 0 ? (
              <div className="text-center py-12 space-y-4">
                <p className="text-xl text-muted-foreground">
                  Não há vagas disponíveis para hoje nesta especialidade.
                </p>
                <Button size="lg" variant="outline" onClick={() => setStep("agendar")}>
                  Voltar
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-4 max-h-[460px] overflow-auto pr-1">
                  {Object.values(
                    vagas.reduce<Record<string, { medico_id: string; medico_nome: string; horarios: Vaga[] }>>(
                      (acc, v) => {
                        if (!acc[v.medico_id]) {
                          acc[v.medico_id] = { medico_id: v.medico_id, medico_nome: v.medico_nome, horarios: [] };
                        }
                        acc[v.medico_id].horarios.push(v);
                        return acc;
                      },
                      {},
                    ),
                  )
                    .sort((a, b) => a.medico_nome.localeCompare(b.medico_nome))
                    .map((grupo) => (
                      <div
                        key={grupo.medico_id}
                        className="rounded-2xl border-2 p-4 bg-card/50"
                      >
                        <div className="mb-3">
                          <div className="text-sm text-muted-foreground">Dr(a).</div>
                          <div className="text-lg font-semibold">{grupo.medico_nome}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {grupo.horarios.map((v) => (
                            <button
                              key={v.inicio}
                              onClick={() => {
                                setVagaSel(v);
                                setFormaPagto(null);
                                setStep("pagamento");
                              }}
                              className="px-4 py-2 rounded-lg border-2 text-base font-mono font-semibold hover:border-primary hover:bg-primary/10 hover:text-primary transition"
                            >
                              {v.hora_label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
                <div className="mt-6 text-center">
                  <Button variant="outline" size="lg" onClick={() => setStep("agendar")}>
                    Voltar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "pagamento" && vagaSel && (
          <div className="w-full max-w-3xl bg-card border rounded-3xl p-10 shadow-xl relative">
            <button
              onClick={() => setStep("vagas")}
              className="absolute top-6 left-6 text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ArrowLeft className="h-5 w-5" /> Voltar
            </button>
            <div className="text-center space-y-1 mb-6">
              <h2 className="text-3xl font-bold">Forma de pagamento</h2>
              <p className="text-muted-foreground">
                {vagaSel.medico_nome} · {vagaSel.hora_label}
              </p>
              {procInfo && (
                <p className="text-sm text-muted-foreground">{procInfo.nome}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["dinheiro", "pix", "cartao_credito", "cartao_debito"] as FormaPagto[]).map((f) => {
                const v = valorPorForma(procInfo, f);
                const ativa = formaPagto === f;
                return (
                  <button
                    key={f}
                    onClick={() => setFormaPagto(f)}
                    className={`p-5 rounded-2xl border-2 text-left transition ${
                      ativa ? "border-primary bg-primary/10" : "hover:border-primary/50"
                    }`}
                  >
                    <div className="text-lg font-semibold">{FORMA_LABEL[f]}</div>
                    <div className="text-3xl font-bold text-primary mt-2 tabular-nums">
                      {v > 0
                        ? v.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })
                        : "—"}
                    </div>
                  </button>
                );
              })}
            </div>
            {!procInfo && (
              <p className="text-center text-sm text-amber-600 mt-4">
                Procedimento de consulta não cadastrado — valor poderá ser confirmado no caixa.
              </p>
            )}
            <Button
              size="lg"
              className="w-full h-16 mt-6 text-lg"
              disabled={busy || !formaPagto}
              onClick={() => confirmarAgendamentoECaixa(pacienteAtual)}
            >
              {busy && <Loader2 className="h-5 w-5 mr-2 animate-spin" />}
              Confirmar e ir para o caixa
            </Button>
          </div>
        )}

        {step === "ok-agendar" && senhaEmitida && (
          <div className="text-center space-y-4 max-w-xl">
            <div className="text-muted-foreground uppercase tracking-widest text-sm">Sua senha</div>
            <div className="text-[8rem] leading-none font-black text-primary tabular-nums">
              {senhaEmitida}
            </div>
            {checkoutInfo ? (
              <div className="bg-card border rounded-2xl p-6 text-left space-y-2">
                <Row label="Profissional" value={checkoutInfo.medico} />
                <Row label="Horário" value={checkoutInfo.hora} />
                <Row label="Pagamento" value={checkoutInfo.forma} />
                <Row
                  label="Valor"
                  value={checkoutInfo.valor.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  strong
                />
              </div>
            ) : null}
            <p className="text-xl font-semibold">Dirija-se ao caixa para efetuar o pagamento.</p>
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className={strong ? "text-2xl font-bold text-primary" : "text-lg"}>{value}</span>
    </div>
  );
}
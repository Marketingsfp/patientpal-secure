import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClinicaProvider, useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";
import {
  Accessibility,
  Stethoscope,
  Hash,
  RotateCcw,
  ArrowLeft,
  Loader2,
  Ticket,
  BadgeCheck,
  CheckCircle2,
  Camera,
  X,
  Contrast,
  AlertTriangle,
} from "lucide-react";
import { imprimirSenhaTotem, gerarSenhaPdfBase64 } from "@/lib/print-senha";
import { imprimirDocumentoSilencioso } from "@/utils/printService";
import { TecladoNumerico, formatarCpfParcial } from "@/components/totem/teclado-numerico";
import { detectDescriptor, ensureFaceModels, FACE_MATCH_THRESHOLD } from "@/lib/face-recognition";

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

type TipoSenha = "N" | "P" | "C" | "R";

const TIPOS: { tipo: TipoSenha; titulo: string; sub: string; Icon: typeof Hash; classe: string }[] = [
  { tipo: "N", titulo: "Comum", sub: "Atendimento padrão", Icon: Hash, classe: "from-sky-600 to-sky-700" },
  { tipo: "P", titulo: "Preferencial", sub: "Idoso · Gestante · PCD · Crianças de colo", Icon: Accessibility, classe: "from-amber-500 to-amber-600" },
  { tipo: "C", titulo: "Cartão consulta", sub: "Titulares do cartão benefício", Icon: Stethoscope, classe: "from-rose-600 to-rose-700" },
  { tipo: "R", titulo: "Retorno", sub: "Pacientes em retorno", Icon: RotateCcw, classe: "from-emerald-600 to-emerald-700" },
];

// "menu" é a tela inicial (check-in OU retirar senha); "senha" mostra os
// tipos; "checkin-facial" é a câmera de reconhecimento; "ticket"/"checkin-ok"
// são telas de conclusão com auto-retorno.
type Step = "menu" | "senha" | "checkin" | "checkin-facial" | "checkin-ok" | "ticket";

type CheckinInfo = {
  paciente_nome: string;
  inicio: string | null;
  medico: string | null;
  procedimento: string | null;
};

export function TotemPage() {
  const navigate = useNavigate();
  const { clinicaAtual, loading } = useClinica();
  const [step, setStep] = useState<Step>("menu");
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<{ codigo: string; tipo: TipoSenha } | null>(null);
  const [cpf, setCpf] = useState("");
  const [checkinInfo, setCheckinInfo] = useState<CheckinInfo | null>(null);
  const [scanMsg, setScanMsg] = useState("Posicione seu rosto na câmera");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Status da impressão da senha — ver item 10 (feedback de impressão).
  const [printStatus, setPrintStatus] = useState<"imprimindo" | "ok" | "falha" | null>(null);

  // ---- Acessibilidade (idosos / baixa visão / PCD) ----
  // escalaIdx: índice em ESCALAS aplicado ao font-size do <html> (rem → escala
  // proporcional de toda a interface). contraste: liga o modo alto contraste.
  const ESCALAS = [1, 1.12, 1.24];
  const [escalaIdx, setEscalaIdx] = useState(0);
  const [contraste, setContraste] = useState(false);
  const [announce, setAnnounce] = useState("");

  // Restaura preferências salvas (persistem entre atendimentos e recargas).
  useEffect(() => {
    try {
      const e = Number(localStorage.getItem("totem.escala") ?? "0");
      if (Number.isFinite(e) && e >= 0 && e <= ESCALAS.length - 1) setEscalaIdx(e);
      setContraste(localStorage.getItem("totem.contraste") === "1");
    } catch { /* ignora */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aplica a escala no <html>. Como o Tailwind usa rem, mexer no font-size da
  // raiz amplia headings, botões e teclado juntos. Limpa ao sair do totem.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    html.style.fontSize = `${16 * ESCALAS[escalaIdx]}px`;
    return () => { html.style.fontSize = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escalaIdx]);

  function mudarEscala(delta: number) {
    setEscalaIdx((i) => {
      const next = Math.min(ESCALAS.length - 1, Math.max(0, i + delta));
      try { localStorage.setItem("totem.escala", String(next)); } catch { /* ignora */ }
      return next;
    });
  }
  function toggleContraste() {
    setContraste((c) => {
      const next = !c;
      try { localStorage.setItem("totem.contraste", next ? "1" : "0"); } catch { /* ignora */ }
      return next;
    });
  }

  // Região aria-live: anuncia por leitor de tela as transições que hoje só
  // existem visualmente (senha emitida, check-in, etapa da câmera).
  useEffect(() => {
    if (step === "ticket" && ticket) {
      const nome = TIPOS.find((t) => t.tipo === ticket.tipo)?.titulo ?? "";
      const avisoImpressao =
        printStatus === "falha"
          ? "Não foi possível imprimir. Anote o número ou procure a recepção."
          : "Retire sua senha impressa.";
      setAnnounce(`Senha ${nome}, número ${ticket.codigo}. ${avisoImpressao} Acompanhe o painel de chamada.`);
    } else if (step === "checkin-ok" && checkinInfo) {
      setAnnounce(`Check-in confirmado. Olá, ${checkinInfo.paciente_nome}. Aguarde sua chamada no painel.`);
    } else if (step === "checkin-facial") {
      setAnnounce(scanMsg);
    } else {
      setAnnounce("");
    }
  }, [step, ticket, checkinInfo, scanMsg, printStatus]);

  // Pré-carrega os modelos de reconhecimento facial em segundo plano para a
  // câmera abrir rápida quando o paciente escolher essa opção.
  useEffect(() => {
    void ensureFaceModels().catch(() => {});
    return () => stopCamera();
  }, []);

  // Modo automático (claro das 06h–17h, escuro caso contrário). Aplica a
  // classe `dark` no <html> enquanto o totem estiver aberto e limpa ao sair.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const apply = () => {
      const h = new Date().getHours();
      const isDark = h < 6 || h >= 17;
      html.classList.toggle("dark", isDark);
    };
    apply();
    const id = setInterval(apply, 60_000);
    return () => { clearInterval(id); html.classList.remove("dark"); };
  }, []);

  // Telas de conclusão voltam sozinhas para o menu inicial — a senha já saiu
  // impressa, então o ticket fica só alguns segundos na tela (sem botão
  // "Concluir"); o check-in fica um pouco mais para o paciente ler os dados.
  // A contagem é exibida na tela (item 9) para o paciente saber que ela vai
  // mudar sozinha, em vez de um timeout silencioso.
  const DURACAO_CONCLUSAO = { ticket: 4, "checkin-ok": 8 } as const;
  const [contagem, setContagem] = useState<number | null>(null);

  useEffect(() => {
    if (step !== "ticket" && step !== "checkin-ok") {
      setContagem(null);
      return;
    }
    setContagem(DURACAO_CONCLUSAO[step]);
    const id = setInterval(() => {
      setContagem((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (contagem !== null && contagem <= 0) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contagem]);

  // Timeout de inatividade (item 8) — se o paciente abandona o totem no meio
  // da digitação do CPF ou na tela de tipos de senha, volta ao menu sozinho
  // após ~45s sem nenhum toque/clique/tecla, em vez de ficar travado ali.
  // Fica de fora do "menu" (já é o início) e do "checkin-facial" (fluxo
  // automático da câmera, sem toque esperado — tem seu próprio bounded loop).
  const INATIVIDADE_MS = 45_000;
  const ultimaAtividadeRef = useRef(Date.now());
  useEffect(() => {
    const bump = () => { ultimaAtividadeRef.current = Date.now(); };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, []);
  useEffect(() => {
    ultimaAtividadeRef.current = Date.now();
  }, [step]);
  useEffect(() => {
    if (step === "menu" || step === "checkin-facial") return;
    const id = setInterval(() => {
      if (Date.now() - ultimaAtividadeRef.current >= INATIVIDADE_MS) reset();
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function reset() {
    stopCamera();
    setTicket(null);
    setCpf("");
    setCheckinInfo(null);
    setPrintStatus(null);
    setStep("menu");
  }

  async function emitir(_tipo: TipoSenha): Promise<void> {
    if (!clinicaAtual) {
      toast.error("Nenhuma clínica selecionada");
      return;
    }
    setBusy(true);
    // Usa a RPC pública quando não há sessão (totem em quiosque via URL com token);
    // clínicas com token público habilitado emitem sem exigir login.
    const { data: { session } } = await supabase.auth.getSession();
    const rpcName = session ? "emitir_senha" : "emitir_senha_publica";
    const args: Record<string, unknown> = { _clinica_id: clinicaAtual.clinica_id, _tipo };
    const { data, error } = await (supabase.rpc as unknown as (
      fn: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>)(rpcName, args);
    setBusy(false);
    if (error || !data) {
      mostrarErro(error);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { codigo: string };
    setTicket({ codigo: row.codigo, tipo: _tipo });
    setStep("ticket");
    // Impressão automática da senha.
    // 1º) tenta impressão silenciosa via QZ Tray (não abre diálogo do navegador).
    // 2º) em qualquer falha (QZ Tray não instalado / websocket recusado /
    //     impressora não encontrada), cai no fluxo antigo por iframe/HTML
    //     que abre o diálogo do Chrome (ou imprime direto no modo --kiosk-printing).
    // Item 10: acompanha o status para avisar o paciente se nada pôde ser
    // impresso (nem silenciosamente nem via diálogo), em vez de dizer
    // "retire sua senha impressa" quando não saiu nada da impressora.
    setPrintStatus("imprimindo");
    void (async () => {
      try {
        const pdfBase64 = await gerarSenhaPdfBase64({
          codigo: row.codigo,
          tipo: _tipo,
          clinicaNome: clinicaAtual.clinica?.nome ?? null,
        });
        await imprimirDocumentoSilencioso(pdfBase64);
        setPrintStatus("ok");
      } catch {
        const agendou = imprimirSenhaTotem({
          codigo: row.codigo,
          tipo: _tipo,
          clinicaNome: clinicaAtual.clinica?.nome ?? null,
        });
        setPrintStatus(agendou ? "ok" : "falha");
      }
    })();
  }

  async function fazerCheckin() {
    if (!clinicaAtual) return;
    if (cpf.length !== 11) {
      toast.error("Digite os 11 números do CPF");
      return;
    }
    setBusy(true);
    // RPC SECURITY DEFINER com grant para anon — o totem roda também nas
    // rotas públicas (/totem/$clinicaId e /totem/t/$token), onde não há
    // sessão e o RLS bloquearia consultas diretas a pacientes/agendamentos.
    const { data, error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>)("totem_checkin_cpf", {
      _clinica_id: clinicaAtual.clinica_id,
      _cpf: cpf,
    });
    setBusy(false);
    if (error) {
      mostrarErro(error);
      return;
    }
    const r = (data ?? {}) as { ok?: boolean; erro?: string } & CheckinInfo;
    if (!r.ok) {
      toast.error(r.erro ?? "Não foi possível fazer o check-in. Procure a recepção.");
      return;
    }
    setCheckinInfo({
      paciente_nome: r.paciente_nome,
      inicio: r.inicio ?? null,
      medico: r.medico ?? null,
      procedimento: r.procedimento ?? null,
    });
    setStep("checkin-ok");
  }

  // Conclui o check-in a partir do paciente identificado pela biometria —
  // mesma regra do check-in por CPF, via RPC pública totem_checkin_paciente.
  async function fazerCheckinPaciente(pacienteId: string) {
    if (!clinicaAtual) return;
    setBusy(true);
    const { data, error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>)("totem_checkin_paciente", {
      _clinica_id: clinicaAtual.clinica_id,
      _paciente_id: pacienteId,
    });
    setBusy(false);
    if (error) {
      mostrarErro(error);
      setStep("checkin");
      return;
    }
    const r = (data ?? {}) as { ok?: boolean; erro?: string } & CheckinInfo;
    if (!r.ok) {
      toast.error(r.erro ?? "Não foi possível fazer o check-in. Procure a recepção.");
      setStep("checkin");
      return;
    }
    setCheckinInfo({
      paciente_nome: r.paciente_nome,
      inicio: r.inicio ?? null,
      medico: r.medico ?? null,
      procedimento: r.procedimento ?? null,
    });
    setStep("checkin-ok");
  }

  // Check-in por reconhecimento facial: liga a câmera, detecta o rosto e
  // procura o match no servidor (totem_match_biometria — os descritores dos
  // pacientes nunca chegam ao navegador). Qualquer falha volta para o CPF.
  async function iniciarCheckinFacial() {
    if (!clinicaAtual) return;
    setStep("checkin-facial");
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

      let descritor: Float32Array | null = null;
      for (let i = 0; i < 12; i++) {
        if (!streamRef.current || !videoRef.current) return; // cancelado pelo paciente
        descritor = await detectDescriptor(videoRef.current);
        if (descritor) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!streamRef.current) return; // cancelado durante a detecção
      if (!descritor) {
        stopCamera();
        toast.error("Rosto não detectado. Digite o CPF.");
        setStep("checkin");
        return;
      }

      setScanMsg("Verificando…");
      const { data: matchData, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)("totem_match_biometria", {
        _clinica_id: clinicaAtual.clinica_id,
        _descriptor: Array.from(descritor),
        _threshold: FACE_MATCH_THRESHOLD,
      });
      stopCamera();
      if (error) {
        mostrarErro(error);
        setStep("checkin");
        return;
      }
      const match = (Array.isArray(matchData) ? matchData[0] : matchData) as
        | { paciente_id: string; nome: string }
        | undefined;
      if (!match?.paciente_id) {
        toast.error("Não reconhecemos seu rosto. Digite o CPF.");
        setStep("checkin");
        return;
      }
      setScanMsg(`Olá, ${match.nome}!`);
      await fazerCheckinPaciente(match.paciente_id);
    } catch {
      stopCamera();
      toast.error("Não foi possível acessar a câmera. Digite o CPF.");
      setStep("checkin");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8 cursor-none [&_*]:cursor-none">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando totem…</p>
        </div>
      </div>
    );
  }

  if (!clinicaAtual) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8 cursor-none [&_*]:cursor-none">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-semibold">Nenhuma clínica selecionada</h1>
          <p className="text-muted-foreground">Faça login no painel administrativo e selecione a clínica antes de abrir o totem.</p>
          <Button onClick={() => navigate({ to: "/app" })}>Ir para o painel</Button>
        </div>
      </div>
    );
  }

  return (
    // h-screen + overflow-hidden (em vez de min-h-screen): a página do totem
    // não pode rolar de jeito nenhum — trava exatamente na altura da
    // viewport e cada tela (header/main/footer) precisa caber dentro disso.
    <div className={`h-[100dvh] overflow-hidden bg-gradient-to-br from-background via-background to-muted/40 flex flex-col cursor-none [&_*]:cursor-none${contraste ? " totem-hc" : ""}`}>
      {/* Anúncios para leitor de tela (invisível visualmente). */}
      <div aria-live="assertive" role="status" className="sr-only">{announce}</div>

      {/* Barra de acessibilidade — fixa, sempre acessível em qualquer etapa.
          Ampliar/reduzir texto e alternar alto contraste. */}
      <div className="fixed bottom-3 left-3 z-50 flex items-center gap-2">
        <button
          onClick={() => mudarEscala(-1)}
          disabled={escalaIdx === 0}
          aria-label="Diminuir tamanho do texto"
          className="h-14 w-14 rounded-2xl border-2 bg-card text-foreground shadow-md flex items-center justify-center text-lg font-bold disabled:opacity-40 active:scale-95 transition"
        >
          A<span className="text-xs align-sub">−</span>
        </button>
        <button
          onClick={() => mudarEscala(1)}
          disabled={escalaIdx === ESCALAS.length - 1}
          aria-label="Aumentar tamanho do texto"
          className="h-14 w-14 rounded-2xl border-2 bg-card text-foreground shadow-md flex items-center justify-center text-2xl font-bold disabled:opacity-40 active:scale-95 transition"
        >
          A<span className="text-sm align-super">+</span>
        </button>
        <button
          onClick={toggleContraste}
          aria-pressed={contraste}
          aria-label="Alternar alto contraste"
          className={`h-14 w-14 rounded-2xl border-2 shadow-md flex items-center justify-center active:scale-95 transition ${contraste ? "bg-foreground text-background border-foreground" : "bg-card text-foreground"}`}
        >
          <Contrast className="h-6 w-6" />
        </button>
      </div>

      {/* Header */}
      <header className="px-6 py-3 flex items-center justify-between shrink-0">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Bem-vindo a</div>
          <h1 className="text-xl md:text-2xl font-bold">{formatarNomeClinica(clinicaAtual.clinica.nome)}</h1>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div className="capitalize">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</div>
          <div className="text-xl md:text-2xl font-mono tabular-nums text-foreground"><Clock /></div>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex items-center justify-center px-6 py-2 overflow-hidden">
        {step === "menu" && (
          <div className="w-full max-w-4xl space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-[clamp(1.75rem,4.5vw,3rem)] font-bold tracking-tight">Como podemos ajudar?</h2>
              <p className="text-[clamp(1rem,2.2vw,1.25rem)] text-muted-foreground">Toque em uma das opções</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                onClick={() => setStep("senha")}
                className="group relative overflow-hidden rounded-3xl p-8 text-left text-white bg-gradient-to-br from-sky-600 to-sky-700 shadow-lg hover:shadow-2xl transition-all active:scale-[0.98] min-h-[240px] flex flex-col justify-between"
              >
                <Ticket className="h-14 w-14" />
                <div>
                  <div className="text-3xl font-bold">Retirar senha</div>
                  <div className="text-white/90 text-sm mt-1">Comum, preferencial, cartão ou retorno</div>
                </div>
                <Ticket className="absolute -right-6 -bottom-6 h-40 w-40 opacity-10" />
              </button>
              <button
                onClick={() => { setCpf(""); setStep("checkin"); }}
                className="group relative overflow-hidden rounded-3xl p-8 text-left text-white bg-gradient-to-br from-emerald-600 to-emerald-700 shadow-lg hover:shadow-2xl transition-all active:scale-[0.98] min-h-[240px] flex flex-col justify-between"
              >
                <BadgeCheck className="h-14 w-14" />
                <div>
                  <div className="text-3xl font-bold">Fazer check-in</div>
                  <div className="text-white/90 text-sm mt-1">Confirme presença na sua consulta de hoje</div>
                </div>
                <BadgeCheck className="absolute -right-6 -bottom-6 h-40 w-40 opacity-10" />
              </button>
            </div>
            <p className="text-center text-xs text-muted-foreground pt-2">
              Em caso de emergência, dirija-se imediatamente à recepção.
            </p>
          </div>
        )}

        {step === "senha" && (
          <div className="w-full max-w-5xl space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-[clamp(1.5rem,4vw,2.25rem)] font-bold tracking-tight">Retire sua senha</h2>
              <p className="text-[clamp(0.95rem,2vw,1.125rem)] text-muted-foreground">Toque na opção desejada</p>
            </div>
            {/* 1 coluna em retrato (formato mais comum de totem) e 2 colunas
                em paisagem — em vez de grid-cols-2 fixo, que apertava os
                cartões em telas verticais. */}
            <div className="grid grid-cols-1 [@media(orientation:landscape)]:grid-cols-2 gap-6">
              {TIPOS.map(({ tipo: t, titulo, sub, Icon, classe }) => (
                <button
                  key={t}
                  disabled={busy}
                  onClick={() => void emitir(t)}
                  className={`group relative overflow-hidden rounded-2xl p-8 text-left text-white bg-gradient-to-br ${classe} shadow-lg hover:shadow-2xl transition-all active:scale-[0.98] disabled:opacity-60`}
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="text-[clamp(1.5rem,3.5vw,1.875rem)] font-bold">{titulo}</div>
                      <div className="text-white/90 text-sm">{sub}</div>
                    </div>
                    <div className="text-[clamp(2.5rem,6vw,3.75rem)] font-black opacity-90">{t}</div>
                  </div>
                  <Icon className="absolute -right-4 -bottom-4 h-32 w-32 opacity-10" />
                </button>
              ))}
            </div>
            <div className="text-center">
              <Button variant="outline" size="lg" className="h-14 px-8 text-base" onClick={reset}>
                <ArrowLeft className="h-5 w-5 mr-2" /> Voltar ao início
              </Button>
            </div>
          </div>
        )}

        {step === "checkin" && (
          // Card do check-in dimensionado para caber inteiro na viewport do
          // totem (a página é h-[100dvh] + overflow-hidden). Sem "max-h-full
          // overflow-hidden" no card — se algum item passar, preferimos
          // reduzir tamanhos aqui a esconder conteúdo por corte.
          <div className="w-full max-w-md bg-card border rounded-3xl p-6 shadow-xl space-y-4 my-auto">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold">Check-in</h2>
              <p className="text-sm text-muted-foreground">Digite seu CPF no teclado abaixo</p>
            </div>
            <input
              readOnly
              inputMode="none"
              value={formatarCpfParcial(cpf)}
              placeholder="000.000.000-00"
              aria-label="CPF digitado"
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
              className="w-full h-12 text-base"
              disabled={busy}
              onClick={() => void iniciarCheckinFacial()}
            >
              <Camera className="h-5 w-5 mr-2" /> Usar reconhecimento facial
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12 text-base" onClick={reset}>
                <ArrowLeft className="h-5 w-5 mr-2" /> Voltar
              </Button>
              <Button className="h-12 text-base" disabled={busy || cpf.length !== 11} onClick={() => void fazerCheckin()}>
                {busy && <Loader2 className="h-5 w-5 mr-2 animate-spin" />} Confirmar
              </Button>
            </div>
          </div>
        )}

        {step === "checkin-facial" && (
          <div className="max-w-xl w-full text-center space-y-4 my-auto">
            <div className="relative mx-auto w-full max-w-[420px] aspect-[4/3] rounded-2xl overflow-hidden border-4 border-primary/40 bg-black">
              <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" playsInline muted />
              <div className="absolute inset-8 border-2 border-white/60 rounded-full pointer-events-none" />
            </div>
            <p className="text-base">{scanMsg}</p>
            <Button
              variant="outline"
              size="lg"
              className="h-12 px-6"
              onClick={() => { stopCamera(); setStep("checkin"); }}
            >
              <X className="h-5 w-5 mr-2" /> Cancelar
            </Button>
          </div>
        )}

        {step === "checkin-ok" && checkinInfo && (
          <div className="text-center space-y-6 max-w-2xl animate-in fade-in zoom-in duration-300">
            <CheckCircle2 className="h-24 w-24 text-emerald-500 mx-auto" />
            <h2 className="text-[clamp(1.5rem,4vw,2.25rem)] font-bold">Check-in confirmado!</h2>
            <p className="text-[clamp(1.25rem,3vw,1.5rem)]">Olá, {checkinInfo.paciente_nome}</p>
            <div className="bg-card border rounded-2xl p-6 text-left space-y-2">
              {checkinInfo.inicio && (
                <div>
                  <span className="text-muted-foreground text-sm">Horário: </span>
                  <span className="text-lg font-semibold">
                    {new Date(checkinInfo.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )}
              {checkinInfo.medico && (
                <div>
                  <span className="text-muted-foreground text-sm">Profissional: </span>
                  <span className="text-lg">{checkinInfo.medico}</span>
                </div>
              )}
              {checkinInfo.procedimento && (
                <div>
                  <span className="text-muted-foreground text-sm">Procedimento: </span>
                  <span className="text-lg">{checkinInfo.procedimento}</span>
                </div>
              )}
            </div>
            <p className="text-muted-foreground">Aguarde sua chamada no painel.</p>
            {contagem !== null && <Contagem segundos={contagem} total={DURACAO_CONCLUSAO["checkin-ok"]} />}
          </div>
        )}

        {step === "ticket" && ticket && (
          <div className="text-center space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="text-muted-foreground uppercase tracking-widest text-sm">Sua senha</div>
            {/* clamp com min(vw,vh): nunca estoura nem a largura nem a altura
                da viewport do totem, em qualquer proporção de tela. */}
            <div className="text-[clamp(4rem,min(18vw,28vh),12rem)] leading-none font-black text-primary tabular-nums">{ticket.codigo}</div>
            {/* Item 10: feedback do status de impressão em vez de sempre
                afirmar "retire sua senha impressa" mesmo quando nada saiu. */}
            {printStatus === "imprimindo" && (
              <div className="flex items-center justify-center gap-2 text-[clamp(1.25rem,3vw,1.5rem)] text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Imprimindo…
              </div>
            )}
            {printStatus === "ok" && (
              <div className="text-[clamp(1.25rem,3vw,1.5rem)]">Retire sua senha impressa</div>
            )}
            {printStatus === "falha" && (
              <div className="flex items-center justify-center gap-2 text-[clamp(1.1rem,2.6vw,1.35rem)] text-amber-600 dark:text-amber-400 font-semibold">
                <AlertTriangle className="h-6 w-6 shrink-0" /> Não foi possível imprimir — anote o número ou procure a recepção
              </div>
            )}
            <p className="text-muted-foreground">Acompanhe o painel de chamada na sala de espera.</p>
            {contagem !== null && <Contagem segundos={contagem} total={DURACAO_CONCLUSAO.ticket} />}
          </div>
        )}
      </main>

      <footer className="px-6 py-2 text-center text-xs text-muted-foreground shrink-0">
        ClinicaOS · Totem · {step !== "menu" && (
          <button onClick={reset} className="underline ml-2">Voltar ao início</button>
        )}
      </footer>
    </div>
  );
}

// Item 9: contagem regressiva visível nas telas de conclusão (ticket /
// check-in confirmado), com barra de progresso, em vez de a tela mudar sem
// aviso quando o timeout silencioso expira.
function Contagem({ segundos, total }: { segundos: number; total: number }) {
  const restante = Math.max(segundos, 0);
  const pct = total > 0 ? Math.max(0, Math.min(100, (restante / total) * 100)) : 0;
  return (
    <div className="pt-1 space-y-1.5">
      <p className="text-xs text-muted-foreground">Voltando ao início em {restante}s…</p>
      <div className="h-1.5 w-40 mx-auto rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
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

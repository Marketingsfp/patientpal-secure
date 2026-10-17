/**
 * Ambiente de testes da Nina: 10, 20 ou 30 conversas simultâneas, cada lead com um modo
 * de paciente difícil (Claude Opus 5.5) e, se ligado, um juiz que lista as
 * falhas da Nina ao fim de cada conversa. Esta tela conduz as conversas: mantê-la aberta.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FlaskConical, Loader2, Play, Square, History, MessageSquareText } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { enviarMensagemTeste } from "@/lib/nina/teste-console.functions";
import {
  avaliarConversaAmbiente,
  conversaAmbiente,
  encerrarConversaAmbiente,
  iniciarRodadaAmbiente,
  listarRodadasAmbiente,
  novaConversaAmbiente,
  prepararAmbienteTestes,
  turnoPacienteAmbiente,
} from "@/lib/nina/ambiente-testes.functions";

type Modo = { id: string; nome: string; resumo: string };
type Falha = {
  categoria: string;
  gravidade: "alta" | "media" | "baixa";
  trecho: string;
  explicacao: string;
};
type Avaliacao = {
  resultado: string;
  nota: number;
  resumo: string;
  falhas: Falha[];
  acertos: string[];
};
type Estado = "aguardando" | "paciente" | "nina" | "avaliando" | "concluida" | "parada" | "erro";
type Linha = { autor: "paciente" | "nina" | "sistema"; texto: string };

type Conversa = {
  posicao: number;
  modo: string;
  assunto: string;
  simulacaoId: string | null;
  leadId: string | null;
  conversaId: string | null;
  estado: Estado;
  turnos: number;
  linhas: Linha[];
  avaliacao: Avaliacao | null;
  erro: string | null;
  motivoFim: string | null;
  /** Tempo de cada resposta da Nina nesta tela (envio → resposta), em ms. */
  tempos: number[];
  /** Teste contínuo: conversas já feitas neste lead e quantas terminaram com erro. */
  feitas?: number;
  erros?: number;
};

type FimConversa = "ok" | "erro" | "parada";

/**
 * Foto de um pedido médico FICTÍCIO, desenhada na própria tela, para a rodada
 * exercitar a leitura de imagem da Nina. Nunca usa dado de paciente real.
 */
function fotoPedidoFicticio(assunto: string): { base64: string; mime: "image/jpeg" } | null {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1200;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#fdfdf8";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#1f2937";
  g.font = "bold 40px sans-serif";
  g.fillText("CLÍNICA EXEMPLO", 60, 100);
  g.font = "bold 34px sans-serif";
  g.fillText("SOLICITAÇÃO DE EXAMES", 60, 200);
  g.font = "28px sans-serif";
  g.fillText("Paciente: Paciente Teste", 60, 290);
  g.fillText(`Data: ${new Date().toLocaleDateString("pt-BR")}`, 60, 340);
  g.fillText("Solicito:", 60, 440);
  const palavras = assunto
    .replace(/^consulta de /i, "avaliação de ")
    .toUpperCase()
    .split(/\s+/);
  let linha = "";
  let y = 500;
  for (const p of palavras) {
    if ((linha + " " + p).trim().length > 40) {
      g.fillText(linha, 90, y);
      y += 44;
      linha = p;
    } else linha = (linha + " " + p).trim();
  }
  if (linha) g.fillText(linha, 90, y);
  g.fillText("Indicação clínica: investigação", 60, y + 90);
  g.fillText("Dr. Médico Fictício — CRM 00000", 60, 1000);
  g.font = "20px sans-serif";
  g.fillText("Ambiente de testes", 60, 1150);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: url.slice(url.indexOf(",") + 1), mime: "image/jpeg" };
}

const segundos = (ms: number) => `${Math.round(ms / 1000)} s`;

type Rodada = {
  rodada: string;
  criadaEm: string;
  conversas: number;
  avaliadas: number;
  notaMedia: number | null;
  falhas: number;
  tokens: number;
};

const ROTULO_ESTADO: Record<Estado, string> = {
  aguardando: "Aguardando",
  paciente: "Paciente escrevendo…",
  nina: "Nina respondendo…",
  avaliando: "Juiz avaliando…",
  concluida: "Concluída",
  parada: "Parada",
  erro: "Erro",
};

const ROTULO_RESULTADO: Record<string, string> = {
  aprovado: "Aprovada",
  aprovado_observacao: "Aprovada com observação",
  reprovado: "Reprovada",
  erro_critico: "Erro crítico",
};

const COR_RESULTADO: Record<string, string> = {
  aprovado: "bg-emerald-600 text-white",
  aprovado_observacao:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  reprovado: "bg-amber-500 text-white",
  erro_critico: "bg-red-600 text-white",
};

const COR_GRAVIDADE: Record<Falha["gravidade"], string> = {
  alta: "text-red-600 dark:text-red-400",
  media: "text-amber-600 dark:text-amber-400",
  baixa: "text-muted-foreground",
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AmbienteTestes() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const preparar = useServerFn(prepararAmbienteTestes);
  const iniciar = useServerFn(iniciarRodadaAmbiente);
  const turno = useServerFn(turnoPacienteAmbiente);
  const enviar = useServerFn(enviarMensagemTeste);
  const encerrar = useServerFn(encerrarConversaAmbiente);
  const avaliar = useServerFn(avaliarConversaAmbiente);
  const listar = useServerFn(listarRodadasAmbiente);
  const novaConversa = useServerFn(novaConversaAmbiente);
  const carregarConversa = useServerFn(conversaAmbiente);

  const [modos, setModos] = useState<Modo[]>([]);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [turnosMax, setTurnosMax] = useState("10");
  const [quantidade, setQuantidade] = useState("20");
  // Juiz desligado por padrão: o foco agora é a Nina respondendo em paralelo.
  const [comJuiz, setComJuiz] = useState(false);
  // "rodada" = uma conversa por lead; "30"/"60" = teste contínuo por esse tempo (min).
  const [duracao, setDuracao] = useState("rodada");
  const [comMidia, setComMidia] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [rodadas, setRodadas] = useState<Rodada[]>([]);
  const [rodadaAberta, setRodadaAberta] = useState<string | null>(null);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Conversa | null>(null);
  const [detalheLinhas, setDetalheLinhas] = useState<Linha[] | null>(null);
  const pararRef = useRef(false);
  const podeEscrever = usePodeEscrever("nina-ambiente-testes");

  const modoPorId = (id: string) => modos.find((m) => m.id === id);

  const atualizar = useCallback((posicao: number, mudanca: Partial<Conversa>) => {
    setConversas((lista) => lista.map((c) => (c.posicao === posicao ? { ...c, ...mudanca } : c)));
  }, []);
  const acrescentar = useCallback((posicao: number, linha: Linha) => {
    setConversas((lista) =>
      lista.map((c) => (c.posicao === posicao ? { ...c, linhas: [...c.linhas, linha] } : c)),
    );
  }, []);

  const registrarTempo = useCallback((posicao: number, ms: number) => {
    setConversas((lista) =>
      lista.map((c) => (c.posicao === posicao ? { ...c, tempos: [...c.tempos, ms] } : c)),
    );
  }, []);

  const carregarRodadas = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const r: any = await listar({ data: { clinicaId } });
      setRodadas(r.rodadas as Rodada[]);
    } catch (e) {
      mostrarErro(e as never, "carregar rodadas do ambiente de testes");
    }
  }, [clinicaId, listar]);

  useEffect(() => {
    if (!clinicaId) return;
    let vivo = true;
    setErroCarga(null);
    preparar({ data: { clinicaId } })
      .then((r: any) => {
        if (!vivo) return;
        setModos(r.modos as Modo[]);
        setConversas(
          (r.leads as { modo: string }[]).map((l, i) => ({
            posicao: i + 1,
            modo: l.modo,
            assunto: "—",
            simulacaoId: null,
            leadId: null,
            conversaId: null,
            estado: "aguardando",
            turnos: 0,
            linhas: [],
            avaliacao: null,
            erro: null,
            motivoFim: null,
            tempos: [],
          })),
        );
      })
      .catch((e: unknown) => vivo && setErroCarga(String((e as Error)?.message ?? e)));
    void carregarRodadas();
    return () => {
      vivo = false;
    };
  }, [clinicaId, preparar, carregarRodadas]);

  // Sair da tela com a rodada rodando interrompe as conversas: avisa antes.
  useEffect(() => {
    if (!rodando) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [rodando]);

  async function conduzir(c: Conversa, avaliarNoFim: boolean): Promise<FimConversa> {
    const { simulacaoId, leadId, posicao } = c;
    if (!clinicaId || !simulacaoId || !leadId) return "parada";
    let turnos = 0;
    try {
      for (;;) {
        if (pararRef.current) break;
        atualizar(posicao, { estado: "paciente" });
        const passo: any = await turno({ data: { clinicaId, simulacaoId } });
        const foto = passo.anexo === "foto_pedido";
        if (passo.acao === "encerrar" || (!passo.mensagem && !foto)) {
          atualizar(posicao, { motivoFim: passo.motivo ?? null });
          break;
        }
        if (pararRef.current) break;
        const audio = passo.anexo === "audio" && passo.audio ? passo.audio : null;
        const imagem = foto ? fotoPedidoFicticio(c.assunto) : null;
        acrescentar(posicao, {
          autor: "paciente",
          texto: audio
            ? `🎤 ${passo.mensagem}`
            : imagem
              ? `📷 Pedido médico${passo.mensagem ? ` · ${passo.mensagem}` : ""}`
              : passo.mensagem || "(foto não gerada)",
        });
        turnos += 1;
        atualizar(posicao, { estado: "nina", turnos });
        const inicioEnvio = performance.now();
        const envio: any = await enviar({
          data: {
            clinicaId,
            leadId,
            // Áudio vai sem texto: a transcrição real preenche.
            ...(audio
              ? { tipo: "audio" as const, texto: "", audioArquivo: audio }
              : imagem
                ? { tipo: "image" as const, texto: passo.mensagem, imagemArquivo: imagem }
                : { tipo: "text" as const, texto: passo.mensagem || "segue o pedido" }),
            chave: `ambiente-${simulacaoId}-${turnos}`,
          },
        });
        if (envio?.processamento === "ERRO" && envio?.erro) throw new Error(envio.erro);
        if (envio?.reply) registrarTempo(posicao, performance.now() - inicioEnvio);
        if (envio?.reply) acrescentar(posicao, { autor: "nina", texto: String(envio.reply) });
        if (envio?.transferida) {
          await encerrar({
            data: {
              clinicaId,
              simulacaoIds: [simulacaoId],
              status: "concluida",
              motivo: "transferida para atendente",
            },
          });
          atualizar(posicao, { motivoFim: "transferida para atendente" });
          break;
        }
      }
      if (pararRef.current) {
        await encerrar({
          data: {
            clinicaId,
            simulacaoIds: [simulacaoId],
            status: "parada",
            motivo: "parada pelo operador",
          },
        }).catch(() => {});
        atualizar(posicao, { estado: "parada" });
        return "parada";
      }
      if (!turnos || !avaliarNoFim) {
        atualizar(posicao, { estado: "concluida" });
        return "ok";
      }
      atualizar(posicao, { estado: "avaliando" });
      const j: any = await avaliar({ data: { clinicaId, simulacaoId } });
      atualizar(posicao, { estado: "concluida", avaliacao: j as Avaliacao });
      return "ok";
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).slice(0, 300);
      await encerrar({
        data: { clinicaId, simulacaoIds: [simulacaoId], status: "erro", motivo: msg },
      }).catch(() => {});
      atualizar(posicao, { estado: "erro", erro: msg });
      return "erro";
    }
  }

  /**
   * Um lead da rodada. No teste contínuo, abre a próxima conversa assim que a
   * anterior termina, até o tempo acabar ou o operador parar.
   */
  async function conduzirLead(
    primeira: Conversa,
    rodada: string,
    avaliarNoFim: boolean,
    fim: number,
  ) {
    let atual = primeira;
    let feitas = 0;
    let erros = 0;
    let errosSeguidos = 0;
    for (;;) {
      const resultado = await conduzir(atual, avaliarNoFim);
      feitas += 1;
      if (resultado === "erro") erros += 1;
      errosSeguidos = resultado === "erro" ? errosSeguidos + 1 : 0;
      atualizar(atual.posicao, { feitas, erros });
      if (!fim || !clinicaId || !atual.leadId || resultado === "parada") return;
      if (pararRef.current || Date.now() >= fim) return;
      // Três erros seguidos no mesmo lead: para este lead (evita repetir a falha sem fim).
      if (errosSeguidos >= 3) {
        atualizar(atual.posicao, { motivoFim: "3 erros seguidos: lead parado" });
        return;
      }
      if (resultado === "erro") await espera(10_000);
      try {
        const r: any = await novaConversa({
          data: { clinicaId, rodada, leadId: atual.leadId },
        });
        if (r.fim) {
          atualizar(atual.posicao, { motivoFim: r.motivo });
          return;
        }
        const mudanca: Partial<Conversa> = {
          simulacaoId: r.item.simulacaoId,
          assunto: r.item.assunto,
          modo: r.item.modo,
          conversaId: null,
          estado: "aguardando",
          turnos: 0,
          linhas: [],
          avaliacao: null,
          erro: null,
          motivoFim: null,
        };
        atual = { ...atual, ...mudanca };
        atualizar(atual.posicao, mudanca);
      } catch (e) {
        atualizar(atual.posicao, {
          estado: "erro",
          erro: String((e as Error)?.message ?? e).slice(0, 300),
        });
        return;
      }
    }
  }

  async function iniciarRodada() {
    if (!clinicaId || rodando) return;
    setIniciando(true);
    pararRef.current = false;
    setRodadaAberta(null);
    const avaliarNoFim = comJuiz;
    const continuo = duracao !== "rodada";
    try {
      const r: any = await iniciar({
        data: {
          clinicaId,
          turnos: Number(turnosMax),
          quantidade: Number(quantidade) as 10 | 20 | 30,
          midia: comMidia,
        },
      });
      const novas: Conversa[] = (r.itens as any[]).map((it) => ({
        posicao: it.posicao,
        modo: it.modo,
        assunto: it.assunto,
        simulacaoId: it.simulacaoId,
        leadId: it.leadId,
        conversaId: null,
        estado: "aguardando",
        turnos: 0,
        linhas: [],
        avaliacao: null,
        erro: null,
        motivoFim: null,
        tempos: [],
      }));
      setConversas(novas);
      setRodando(true);
      setIniciando(false);
      // Início escalonado: as conversas não chegam no mesmo segundo (1,5 s entre elas).
      // O relógio do contínuo começa com a rodada; o servidor também tem um teto próprio.
      const fim = continuo ? Date.now() + Number(duracao) * 60_000 : 0;
      await Promise.all(
        novas.map((c, i) =>
          espera(i * 1500).then(() => conduzirLead(c, r.rodada as string, avaliarNoFim, fim)),
        ),
      );
      toast.success(
        avaliarNoFim ? "Rodada concluída. As avaliações estão nos cards." : "Rodada concluída.",
      );
    } catch (e) {
      mostrarErro(e as never, "iniciar a rodada do ambiente de testes");
    } finally {
      setIniciando(false);
      setRodando(false);
      void carregarRodadas();
    }
  }

  function pararRodada() {
    pararRef.current = true;
    toast.info("Parando: cada conversa termina a mensagem em andamento.");
  }

  async function abrirRodada(rodada: string) {
    if (!clinicaId || rodando) return;
    try {
      const r: any = await listar({ data: { clinicaId, rodada } });
      setRodadaAberta(rodada);
      setConversas(
        (r.conversas as any[]).map((c) => ({
          posicao: c.posicao,
          modo: c.modo,
          assunto: c.assunto,
          simulacaoId: c.simulacaoId,
          leadId: null,
          conversaId: c.conversaId,
          estado:
            c.status === "executando"
              ? "parada"
              : c.status === "erro"
                ? "erro"
                : c.status === "parada"
                  ? "parada"
                  : "concluida",
          turnos: c.turnos,
          linhas: [],
          avaliacao: c.avaliacao as Avaliacao | null,
          erro: null,
          motivoFim: c.motivoFim,
          tempos: [],
        })),
      );
    } catch (e) {
      mostrarErro(e as never, "abrir a rodada");
    }
  }

  async function verDetalhe(c: Conversa) {
    setDetalhe(c);
    setDetalheLinhas(c.linhas.length && !c.conversaId ? c.linhas : null);
    if (!clinicaId || !c.conversaId) return;
    try {
      const r: any = await carregarConversa({ data: { clinicaId, conversaId: c.conversaId } });
      setDetalheLinhas(r.linhas as Linha[]);
    } catch (e) {
      mostrarErro(e as never, "carregar a conversa");
      setDetalheLinhas(c.linhas);
    }
  }

  if (!clinicaId) return null;
  if (erroCarga)
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        Não foi possível abrir o ambiente de testes: {erroCarga}
      </p>
    );
  if (!modos.length)
    return (
      <p role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Preparando o ambiente de
        testes…
      </p>
    );

  // Antes da primeira rodada, a grade mostra só os leads que a rodada escolhida vai usar.
  const grade = conversas.some((c) => c.simulacaoId)
    ? conversas
    : conversas.slice(0, Number(quantidade));
  const todosTempos = conversas.flatMap((c) => c.tempos);
  const ordenados = [...todosTempos].sort((a, b) => a - b);
  const mediana = ordenados.length ? ordenados[Math.floor(ordenados.length / 2)]! : null;
  const feitasSessao = conversas.reduce((s, c) => s + (c.feitas ?? 0), 0);
  const errosSessao = conversas.reduce((s, c) => s + (c.erros ?? 0), 0);
  const concluidas = conversas.filter((c) => c.avaliacao);
  const media = concluidas.length
    ? Math.round(concluidas.reduce((t, c) => t + (c.avaliacao?.nota ?? 0), 0) / concluidas.length)
    : null;

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FlaskConical className="h-5 w-5" aria-hidden="true" /> Ambiente de testes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            10, 20 ou 30 conversas ao mesmo tempo. Em cada uma, um paciente simulado (Claude Opus
            5.5) tenta dificultar a Nina de um jeito diferente, sem ver nada do prompt, das
            ferramentas ou do catálogo dela. Com "Avaliar com o juiz" ligado, um juiz lista no fim
            as falhas de cada conversa. Os leads são próprios deste ambiente (não mexem nos 10 leads
            da Homologação). Com 20 ou 30, os modos se repetem com assuntos diferentes. "Contínuo"
            abre uma conversa nova em cada lead assim que a anterior termina, até o tempo acabar.
            "Incluir áudio e foto" faz o paciente mandar às vezes nota de voz (transcrita de
            verdade) e a foto de um pedido médico fictício quando a Nina pedir.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="ambiente-juiz" className="flex items-center gap-2 text-sm">
              <Switch
                id="ambiente-juiz"
                checked={comJuiz}
                onCheckedChange={setComJuiz}
                disabled={rodando || iniciando}
              />
              Avaliar com o juiz
            </label>
            <label htmlFor="ambiente-midia" className="flex items-center gap-2 text-sm">
              <Switch
                id="ambiente-midia"
                checked={comMidia}
                onCheckedChange={setComMidia}
                disabled={rodando || iniciando}
              />
              Incluir áudio e foto
            </label>
            <label htmlFor="ambiente-duracao" className="text-sm">
              Duração
            </label>
            <Select value={duracao} onValueChange={setDuracao} disabled={rodando || iniciando}>
              <SelectTrigger id="ambiente-duracao" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rodada">Uma rodada</SelectItem>
                <SelectItem value="30">Contínuo 30 min</SelectItem>
                <SelectItem value="60">Contínuo 60 min</SelectItem>
              </SelectContent>
            </Select>
            <label htmlFor="ambiente-quantidade" className="text-sm">
              Conversas
            </label>
            <Select
              value={quantidade}
              onValueChange={setQuantidade}
              disabled={rodando || iniciando}
            >
              <SelectTrigger id="ambiente-quantidade" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["10", "20", "30"].map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label htmlFor="ambiente-turnos" className="text-sm">
              Mensagens do paciente por conversa
            </label>
            <Select value={turnosMax} onValueChange={setTurnosMax} disabled={rodando || iniciando}>
              <SelectTrigger id="ambiente-turnos" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["6", "10", "14"].map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rodando ? (
              <Button variant="destructive" onClick={pararRodada}>
                <Square className="mr-1 h-4 w-4" aria-hidden="true" /> Parar
              </Button>
            ) : (
              <Button
                onClick={() => void iniciarRodada()}
                disabled={iniciando || !podeEscrever}
                title={podeEscrever ? undefined : "Seu perfil só pode consultar esta tela."}
              >
                {iniciando ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="mr-1 h-4 w-4" aria-hidden="true" />
                )}
                Iniciar {quantidade} conversas
              </Button>
            )}
            {feitasSessao > 0 && (
              <Badge variant="outline" className="text-sm">
                Conversas feitas: {feitasSessao} · com erro: {errosSessao}
              </Badge>
            )}
            {mediana !== null && (
              <Badge variant="outline" className="text-sm">
                Respostas da Nina: {todosTempos.length} · mediana {segundos(mediana)} · pior{" "}
                {segundos(ordenados[ordenados.length - 1]!)}
              </Badge>
            )}
            {media !== null && (
              <Badge variant="outline" className="ml-auto text-sm">
                Nota média: {media} · {concluidas.length}/{conversas.length} avaliadas
              </Badge>
            )}
          </div>
          {rodando && (
            <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
              Mantenha esta aba aberta enquanto a rodada roda: é ela que conduz as conversas.
            </p>
          )}
          {rodadaAberta && !rodando && (
            <p className="text-xs text-muted-foreground">Mostrando uma rodada anterior.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {grade.map((c) => {
          const modo = modoPorId(c.modo);
          const ativo = c.estado === "paciente" || c.estado === "nina" || c.estado === "avaliando";
          return (
            <Card key={c.posicao} className="flex min-w-0 flex-col">
              <CardHeader className="space-y-1 p-3 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">#{c.posicao}</span>
                  <Badge
                    variant={c.estado === "erro" ? "destructive" : "secondary"}
                    className="text-[11px]"
                  >
                    {ativo && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
                    {ROTULO_ESTADO[c.estado]}
                  </Badge>
                </div>
                <p className="text-sm font-semibold">{modo?.nome ?? c.modo}</p>
                <p className="text-xs text-muted-foreground" title={modo?.resumo}>
                  {modo?.resumo}
                </p>
                <p className="truncate text-xs" title={c.assunto}>
                  <span className="text-muted-foreground">Assunto: </span>
                  {c.assunto}
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-2 p-3 pt-0">
                {c.linhas.length > 0 && (
                  <div
                    className="max-h-56 space-y-1.5 overflow-auto rounded-md border bg-muted/30 p-2 text-xs"
                    aria-label={`Conversa ${c.posicao}`}
                  >
                    {c.linhas.slice(-8).map((l, i) => (
                      <p key={i} className="whitespace-pre-wrap break-words">
                        <span
                          className={
                            l.autor === "paciente"
                              ? "font-semibold text-sky-700 dark:text-sky-300"
                              : "font-semibold text-violet-700 dark:text-violet-300"
                          }
                        >
                          {l.autor === "paciente" ? "Paciente: " : "Nina: "}
                        </span>
                        {l.texto.length > 400 ? `${l.texto.slice(0, 400)}…` : l.texto}
                      </p>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {(c.feitas ?? 0) > 0 && `${c.feitas} conversa(s) neste lead · `}
                  {c.turnos} mensagem(ns) do paciente
                  {c.tempos.length
                    ? ` · Nina: última ${segundos(c.tempos[c.tempos.length - 1]!)}, pior ${segundos(Math.max(...c.tempos))}`
                    : ""}
                  {c.motivoFim ? ` · ${c.motivoFim}` : ""}
                </p>
                {c.erro && (
                  <p role="alert" className="text-xs text-destructive">
                    {c.erro}
                  </p>
                )}
                {c.avaliacao && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${COR_RESULTADO[c.avaliacao.resultado] ?? ""}`}
                      >
                        {ROTULO_RESULTADO[c.avaliacao.resultado] ?? c.avaliacao.resultado}
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{c.avaliacao.nota}</span>
                    </div>
                    <ul className="space-y-0.5 text-xs">
                      {c.avaliacao.falhas.slice(0, 3).map((f, i) => (
                        <li key={i} className={COR_GRAVIDADE[f.gravidade]}>
                          • {f.explicacao}
                        </li>
                      ))}
                      {c.avaliacao.falhas.length > 3 && (
                        <li className="text-muted-foreground">
                          + {c.avaliacao.falhas.length - 3} falha(s)
                        </li>
                      )}
                    </ul>
                  </div>
                )}
                {(c.linhas.length > 0 || c.conversaId) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-auto"
                    onClick={() => void verDetalhe(c)}
                  >
                    <MessageSquareText className="mr-1 h-4 w-4" aria-hidden="true" /> Ver conversa
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" aria-hidden="true" /> Rodadas anteriores
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rodadas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma rodada ainda.</p>
          ) : (
            <ul className="divide-y text-sm">
              {rodadas.map((r) => (
                <li key={r.rodada} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  <span className="tabular-nums">
                    {new Date(r.criadaEm).toLocaleString("pt-BR")}
                  </span>
                  <span>
                    Nota média: <b>{r.notaMedia ?? "—"}</b>
                  </span>
                  <span>
                    {r.avaliadas}/{r.conversas} avaliadas · {r.falhas} falha(s)
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {Math.round(r.tokens / 1000)} mil tokens do paciente
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    disabled={rodando}
                    onClick={() => void abrirRodada(r.rodada)}
                  >
                    Abrir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detalhe} onOpenChange={(aberto) => !aberto && setDetalhe(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
          {detalhe && (
            <>
              <DialogHeader>
                <DialogTitle>
                  #{detalhe.posicao} · {modoPorId(detalhe.modo)?.nome ?? detalhe.modo}
                </DialogTitle>
                <DialogDescription>Assunto: {detalhe.assunto}</DialogDescription>
              </DialogHeader>
              {detalhe.avaliacao && (
                <section className="space-y-2 text-sm">
                  <p>
                    <b>
                      {ROTULO_RESULTADO[detalhe.avaliacao.resultado] ?? detalhe.avaliacao.resultado}
                    </b>{" "}
                    · nota {detalhe.avaliacao.nota}
                  </p>
                  <p>{detalhe.avaliacao.resumo}</p>
                  {detalhe.avaliacao.falhas.length > 0 && (
                    <ul className="space-y-2">
                      {detalhe.avaliacao.falhas.map((f, i) => (
                        <li key={i} className="rounded border p-2">
                          <p className={`text-xs font-semibold ${COR_GRAVIDADE[f.gravidade]}`}>
                            {f.gravidade.toUpperCase()} · {f.categoria.replace(/_/g, " ")}
                          </p>
                          {f.trecho && <p className="text-xs italic">“{f.trecho}”</p>}
                          <p className="text-xs">{f.explicacao}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {detalhe.avaliacao.acertos.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Acertos: {detalhe.avaliacao.acertos.join(" · ")}
                    </p>
                  )}
                </section>
              )}
              <section className="space-y-1.5 rounded-md border bg-muted/30 p-3 text-sm">
                {!detalheLinhas ? (
                  <p role="status" className="text-muted-foreground">
                    Carregando a conversa…
                  </p>
                ) : (
                  detalheLinhas.map((l, i) => (
                    <p key={i} className="whitespace-pre-wrap break-words">
                      <span className="font-semibold">
                        {l.autor === "paciente"
                          ? "Paciente"
                          : l.autor === "nina"
                            ? "Nina"
                            : "Sistema"}
                        :{" "}
                      </span>
                      {l.texto}
                    </p>
                  ))
                )}
              </section>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mic, MicOff, PhoneCall, PhoneOff } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { useClinicFeatureFlag } from "@/hooks/use-clinic-feature-flag";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  FLAG_NINA_LIGACAO,
  MODULO_LIGACAO,
  VOZES_LIGACAO,
  VOZ_PADRAO_LIGACAO,
  type VozLigacao,
} from "@/lib/nina/ligacao/config";
import {
  ESTADO_INICIAL_LIGACAO,
  ROTULOS_FERRAMENTAS,
  aplicarEventoLigacao,
  chamadaDoEvento,
  eventosResultadoFerramenta,
  type EstadoLigacao,
  type StatusLigacao,
} from "@/lib/nina/ligacao/eventos-ligacao";
import { conectarLigacao, type ConexaoLigacao } from "@/lib/nina/ligacao/conexao-live";
import {
  executarFerramentaLigacaoNina,
  iniciarLigacaoNina,
  resumoLigacaoNina,
} from "@/lib/nina/ligacao/ligacao.functions";

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";

const ROTULO_STATUS: Record<StatusLigacao, string> = {
  parada: "Pronta para ligar",
  conectando: "Conectando…",
  em_andamento: "Em ligação",
  encerrando: "Encerrando…",
  encerrada: "Ligação encerrada",
};

type Acao =
  | { tipo: "evento"; evento: unknown }
  | { tipo: "status"; status: StatusLigacao }
  | { tipo: "erro"; erro: string }
  | { tipo: "reiniciar" };

function reduzir(estado: EstadoLigacao, acao: Acao): EstadoLigacao {
  switch (acao.tipo) {
    case "evento":
      return aplicarEventoLigacao(estado, acao.evento);
    case "status":
      return { ...estado, status: acao.status };
    case "erro":
      return { ...estado, erro: acao.erro };
    case "reiniciar":
      return { ...ESTADO_INICIAL_LIGACAO, status: "conectando" };
  }
}

type Bastidor = { id: number; texto: string; destaque: boolean };

function duracao(segundos: number) {
  const s = Math.max(0, Math.floor(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function LigacaoNina() {
  const { clinicaAtual } = useClinica();
  const { enabled, loading } = useClinicFeatureFlag(FLAG_NINA_LIGACAO);
  if (loading)
    return (
      <p role="status" className="p-6 text-sm">
        Carregando…
      </p>
    );
  if (!clinicaAtual) return <p className="p-6 text-sm">Selecione uma clínica.</p>;
  if (!enabled)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        A ligação de demonstração não está ativa nesta clínica.
      </p>
    );
  return <PainelLigacao key={clinicaAtual.clinica_id} clinicaId={clinicaAtual.clinica_id} />;
}

function PainelLigacao({ clinicaId }: { clinicaId: string }) {
  const podeLigar = usePodeEscrever(MODULO_LIGACAO);
  const carregarResumo = useServerFn(resumoLigacaoNina);
  const iniciar = useServerFn(iniciarLigacaoNina);
  const executar = useServerFn(executarFerramentaLigacaoNina);
  const resumo = useQuery({
    queryKey: ["nina-ligacao-resumo", clinicaId],
    queryFn: () => carregarResumo({ data: { clinicaId } }),
    staleTime: 60_000,
    retry: false,
  });

  const [estado, despachar] = useReducer(reduzir, ESTADO_INICIAL_LIGACAO);
  const [voz, setVoz] = useState<VozLigacao>(VOZ_PADRAO_LIGACAO);
  const [mudo, setMudo] = useState(false);
  const [relogio, setRelogio] = useState(0);
  const [bastidores, setBastidores] = useState<Bastidor[]>([]);
  const conexao = useRef<ConexaoLigacao | null>(null);
  const chamadasVistas = useRef(new Set<string>());
  const fila = useRef<Promise<void>>(Promise.resolve());
  const fimDaConversa = useRef<HTMLDivElement | null>(null);

  const emLigacao = estado.status === "conectando" || estado.status === "em_andamento";

  useEffect(() => {
    if (estado.status !== "em_andamento") return;
    const inicio = Date.now();
    const t = setInterval(() => setRelogio((Date.now() - inicio) / 1000), 1000);
    return () => clearInterval(t);
  }, [estado.status]);

  useEffect(() => {
    fimDaConversa.current?.scrollIntoView({ block: "nearest" });
  }, [estado.falas]);

  // Sair da aba ou trocar de clínica encerra a ligação.
  useEffect(
    () => () => {
      void conexao.current?.encerrar();
      conexao.current = null;
    },
    [],
  );

  function registrar(texto: string, destaque = false) {
    setBastidores((b) => [...b, { id: (b[b.length - 1]?.id ?? 0) + 1, texto, destaque }]);
  }

  function tratarEvento(evento: unknown) {
    despachar({ tipo: "evento", evento });
    const chamada = chamadaDoEvento(evento);
    if (!chamada || chamadasVistas.current.has(chamada.callId)) return;
    chamadasVistas.current.add(chamada.callId);
    // Uma ferramenta por vez, na ordem em que o modelo pediu.
    fila.current = fila.current.then(async () => {
      try {
        const r = await executar({
          data: { clinicaId, nome: chamada.nome, argumentos: chamada.argumentos },
        });
        registrar(ROTULOS_FERRAMENTAS[chamada.nome] ?? chamada.nome);
        if (r.encaminhamento)
          registrar(
            `Encaminhado à equipe${r.encaminhamento.setor ? ` (${r.encaminhamento.setor})` : ""}: ${r.encaminhamento.motivo}`,
            true,
          );
        for (const e of eventosResultadoFerramenta(chamada.callId, r.saida))
          conexao.current?.enviar(e);
      } catch (e) {
        registrar(`Falha ao executar: ${ROTULOS_FERRAMENTAS[chamada.nome] ?? chamada.nome}`, true);
        for (const ev of eventosResultadoFerramenta(
          chamada.callId,
          JSON.stringify({ ok: false, erro: "INTERNAL_ERROR", mensagem: "Falha ao consultar." }),
        ))
          conexao.current?.enviar(ev);
        console.error("[nina-ligacao] ferramenta", chamada.nome, e);
      }
    });
  }

  async function ligar() {
    if (emLigacao || !podeLigar) return;
    despachar({ tipo: "reiniciar" });
    setBastidores([]);
    setRelogio(0);
    setMudo(false);
    chamadasVistas.current = new Set();
    try {
      conexao.current = await conectarLigacao({
        iniciar: async (sdp) => {
          const r = await iniciar({ data: { clinicaId, sdp, voz } });
          return { sdp: r.sdp };
        },
        aoEvento: tratarEvento,
        aoCair: () => {
          conexao.current = null;
          despachar({ tipo: "status", status: "encerrada" });
        },
      });
    } catch (e) {
      conexao.current = null;
      despachar({ tipo: "status", status: "parada" });
      if (e instanceof DOMException && e.name === "NotAllowedError")
        despachar({ tipo: "erro", erro: "Permita o uso do microfone no navegador para ligar." });
      else mostrarErro(e);
    }
  }

  async function desligar() {
    const atual = conexao.current;
    if (!atual) return;
    despachar({ tipo: "status", status: "encerrando" });
    await atual.encerrar();
    conexao.current = null;
    despachar({ tipo: "status", status: "encerrada" });
  }

  function alternarMudo() {
    const novo = !mudo;
    conexao.current?.mutar(novo);
    setMudo(novo);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Ligação com a Nina
            <Badge variant={emLigacao ? "default" : "secondary"}>
              {ROTULO_STATUS[estado.status]}
            </Badge>
            {(emLigacao || estado.status === "encerrada") && (
              <span className="text-sm font-normal tabular-nums text-muted-foreground">
                {duracao(estado.segundos || relogio)}
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Demonstração por voz com as mesmas instruções do chat. Agendar, identificar e encaminhar
            são apenas simulados; nada é gravado na agenda nem enviado ao paciente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full space-y-1 sm:w-48">
              <Label htmlFor="ligacao-voz">Voz</Label>
              <select
                id="ligacao-voz"
                className={selectClass}
                value={voz}
                disabled={emLigacao}
                onChange={(e) => setVoz(e.target.value as VozLigacao)}
              >
                {VOZES_LIGACAO.map((v) => (
                  <option key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {emLigacao || estado.status === "encerrando" ? (
              <>
                <Button
                  variant="destructive"
                  onClick={desligar}
                  disabled={estado.status === "encerrando"}
                >
                  <PhoneOff className="mr-2 h-4 w-4" /> Desligar
                </Button>
                <Button
                  variant="outline"
                  onClick={alternarMudo}
                  disabled={estado.status !== "em_andamento"}
                  aria-pressed={mudo}
                >
                  {mudo ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                  {mudo ? "Ativar microfone" : "Silenciar"}
                </Button>
              </>
            ) : (
              <Button onClick={ligar} disabled={!podeLigar || resumo.isPending || resumo.isError}>
                <PhoneCall className="mr-2 h-4 w-4" /> Ligar
              </Button>
            )}
          </div>
          {!podeLigar && (
            <p className="text-sm text-muted-foreground">
              Seu perfil pode ver esta tela, mas não iniciar ligações.
            </p>
          )}
          {estado.erro && (
            <p role="alert" className="text-sm text-destructive">
              {estado.erro}
            </p>
          )}

          <div
            className="h-[50vh] min-h-64 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3"
            aria-live="polite"
            aria-label="Transcrição da ligação"
          >
            {estado.falas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {emLigacao
                  ? "Fale normalmente; a transcrição aparece aqui."
                  : "Clique em Ligar e faça o papel do paciente."}
              </p>
            ) : (
              estado.falas.map((f) => (
                <div
                  key={f.id}
                  className={f.quem === "paciente" ? "flex justify-end" : "flex justify-start"}
                >
                  <p
                    className={
                      "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm " +
                      (f.quem === "paciente"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border")
                    }
                  >
                    <span className="sr-only">
                      {f.quem === "paciente" ? "Paciente: " : "Nina: "}
                    </span>
                    {f.texto}
                  </p>
                </div>
              ))
            )}
            <div ref={fimDaConversa} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bastidores</CardTitle>
            <CardDescription>O que a Nina consultou durante a ligação.</CardDescription>
          </CardHeader>
          <CardContent>
            {bastidores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma consulta ainda.</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {bastidores.map((b) => (
                  <li key={b.id} className={b.destaque ? "font-medium text-primary" : undefined}>
                    {b.texto}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instruções carregadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {resumo.isPending ? (
              <p role="status">Carregando instruções…</p>
            ) : resumo.isError ? (
              <div className="space-y-2">
                <p role="alert" className="text-destructive">
                  {resumo.error instanceof Error
                    ? resumo.error.message
                    : "Não foi possível carregar as instruções."}
                </p>
                <Button size="sm" variant="outline" onClick={() => resumo.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <>
                <p>
                  Prompt publicado:{" "}
                  {resumo.data.origemPrompt === "codigo"
                    ? "reserva do código (sem versão publicada)"
                    : `versão ${resumo.data.versaoPrompt ?? "?"}`}
                </p>
                <p>Agenda pela Nina: {resumo.data.podeAgendar ? "ativa" : "desligada"}</p>
                <details>
                  <summary className="cursor-pointer">
                    {resumo.data.regras.length} regras do turno
                  </summary>
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                    {resumo.data.regras.map((r) => (
                      <li key={r} className="break-all">
                        {r}
                      </li>
                    ))}
                  </ul>
                </details>
                <details>
                  <summary className="cursor-pointer">
                    {resumo.data.ferramentas.length} ferramentas
                  </summary>
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                    {resumo.data.ferramentas.map((f) => (
                      <li key={f}>{ROTULOS_FERRAMENTAS[f] ?? f}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

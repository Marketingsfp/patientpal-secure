/**
 * FASE 6 — Teste de carga e alto volume (homologação).
 *
 * A tela só configura e acompanha: quem controla concorrência, ritmo, fila,
 * tentativas, tempo limite e cancelamento é o backend. As mensagens sintéticas
 * são geradas pelo GPT Luna (variações de linguagem do paciente).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gauge, Loader2, Play, RefreshCw, Square } from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LIMITE_CONFIRMACAO,
  PERFIS,
  ROTULO_PERFIL,
  exigeConfirmacao,
  normalizarConfig,
  type ConfigCarga,
  type Perfil,
} from "@/lib/nina/carga";
import {
  criarTesteCarga,
  detalheTesteCarga,
  executarLoteCarga,
  listarTestesCarga,
  pararTesteCarga,
  prepararLeadsTesteCarga,
} from "@/lib/nina/carga.functions";

const CENARIOS_PADRAO = [
  "Quero marcar consulta com cardiologista",
  "Quero saber o preço de uma ultrassonografia",
  "Preciso cancelar minha consulta",
];

function ms(v: number | null | undefined) {
  if (v == null) return "—";
  return `${Math.round(v)} ms`;
}

export function CargaTeste() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const criar = useServerFn(criarTesteCarga);
  const preparar = useServerFn(prepararLeadsTesteCarga);
  const executar = useServerFn(executarLoteCarga);
  const parar = useServerFn(pararTesteCarga);
  const listar = useServerFn(listarTestesCarga);
  const detalhar = useServerFn(detalheTesteCarga);

  const [perfil, setPerfil] = useState<Perfil>("leve");
  const [config, setConfig] = useState<ConfigCarga>(() => ({ ...PERFIS.leve }));
  const [cenarios, setCenarios] = useState(CENARIOS_PADRAO.join("\n"));
  const [usarLuna, setUsarLuna] = useState(true);

  const [testes, setTestes] = useState<any[]>([]);
  const [cargaId, setCargaId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<any>(null);
  const [rodando, setRodando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  // FASE 3 — preparação dos leads antes do primeiro disparo.
  const [preparo, setPreparo] = useState<{ prontos: number; total: number } | null>(null);
  const [erroPreparo, setErroPreparo] = useState<string | null>(null);
  const cancelado = useRef(false);
  /** Trava local contra duplo clique (o backend também recusa dois runs). */
  const iniciando = useRef(false);
  const confirmadoRef = useRef(false);

  const configAtual = useCallback((): ConfigCarga => {
    const distribuicao = cenarios
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length >= 3)
      .map((cenario) => ({ cenario, peso: 1 }));
    return normalizarConfig({ ...config, perfil, distribuicao });
  }, [cenarios, config, perfil]);

  const recarregar = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const r: any = await listar({ data: { clinicaId } });
      setTestes(r.testes ?? []);
    } catch (e) {
      mostrarErro(e);
    }
  }, [clinicaId, listar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const abrirDetalhe = useCallback(
    async (id: string) => {
      if (!clinicaId) return;
      try {
        const r: any = await detalhar({ data: { clinicaId, cargaId: id } });
        setDetalhe(r);
      } catch (e) {
        mostrarErro(e);
      }
    },
    [clinicaId, detalhar],
  );

  const trocarPerfil = (p: Perfil) => {
    setPerfil(p);
    if (p !== "customizado") setConfig({ ...PERFIS[p] });
  };

  const iniciar = async (confirmado: boolean) => {
    if (!clinicaId) return;
    if (iniciando.current) return;
    const cfg = configAtual();
    if (exigeConfirmacao(cfg) && !confirmado) {
      setConfirmar(true);
      return;
    }
    setConfirmar(false);
    confirmadoRef.current = confirmado;
    iniciando.current = true;
    setRodando(true);
    setErroPreparo(null);
    cancelado.current = false;
    try {
      const criada: any = await criar({
        data: {
          clinicaId,
          nome: `Carga ${ROTULO_PERFIL[cfg.perfil].split(" —")[0]} · ${cfg.totalMensagens} msg`,
          config: cfg,
          confirmado,
          usarLuna,
        },
      });
      const id = criada.carga.id as string;
      setCargaId(id);
      await recarregar();

      // PREPARANDO LEADS — nenhum disparo antes de todos ficarem prontos.
      const totalLeads = Number(criada.participantes ?? 0);
      setPreparo({ prontos: 0, total: totalLeads });
      let pronto = false;
      while (!pronto && !cancelado.current) {
        const p: any = await preparar({ data: { clinicaId, cargaId: id } });
        setPreparo({ prontos: p.prontos, total: p.total || totalLeads });
        if (p.erro || p.status === "erro") {
          setPreparo(null);
          setErroPreparo(p.erro ?? "Preparação falhou.");
          await recarregar();
          return;
        }
        pronto = Boolean(p.pronto);
      }
      if (!pronto) return;
      setPreparo(null);

      // O servidor executa por lotes; aqui só pedimos o próximo lote.
      let status = "executando";
      while (status === "executando" && !cancelado.current) {
        const r: any = await executar({ data: { clinicaId, cargaId: id } });
        status = r.status;
        await abrirDetalhe(id);
      }
      await recarregar();
      toast.success(status === "concluido" ? "Teste de carga concluído." : "Teste de carga parado.");
    } catch (e) {
      mostrarErro(e);
    } finally {
      iniciando.current = false;
      setRodando(false);
    }
  };

  const pararAgora = async () => {
    if (!clinicaId || !cargaId) return;
    cancelado.current = true;
    try {
      await parar({ data: { clinicaId, cargaId } });
      toast.success("Parando o teste de carga.");
      await recarregar();
    } catch (e) {
      mostrarErro(e);
    }
  };

  const cfgPrevia = configAtual();
  const m = detalhe?.metricas;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4" /> Testes de carga e alto volume
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void recarregar()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Roda apenas na homologação, pelos Leads de Teste. Nada é enviado ao WhatsApp real. Os
          números mostrados são apenas os efetivamente medidos neste teste — não representam a
          capacidade máxima do sistema.
        </p>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Perfil</Label>
            <Select value={perfil} onValueChange={(v) => trocarPerfil(v as Perfil)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["leve", "medio", "alto", "customizado"] as Perfil[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {ROTULO_PERFIL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Leads ativos (1–10)</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={config.leadsAtivos}
              onChange={(e) => {
                setPerfil("customizado");
                setConfig((c) => ({ ...c, leadsAtivos: Number(e.target.value) }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Total de mensagens</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={config.totalMensagens}
              onChange={(e) => {
                setPerfil("customizado");
                setConfig((c) => ({ ...c, totalMensagens: Number(e.target.value) }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Conversas simultâneas</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={config.conversasSimultaneas}
              onChange={(e) => {
                setPerfil("customizado");
                setConfig((c) => ({ ...c, conversasSimultaneas: Number(e.target.value) }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mensagens por minuto</Label>
            <Input
              type="number"
              min={1}
              max={240}
              value={config.mensagensPorMinuto}
              onChange={(e) => {
                setPerfil("customizado");
                setConfig((c) => ({ ...c, mensagensPorMinuto: Number(e.target.value) }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Duração máxima (s)</Label>
            <Input
              type="number"
              min={30}
              max={1800}
              value={config.duracaoMaxS}
              onChange={(e) => {
                setPerfil("customizado");
                setConfig((c) => ({ ...c, duracaoMaxS: Number(e.target.value) }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Intervalo entre disparos (ms)</Label>
            <Input
              type="number"
              min={0}
              max={60000}
              value={config.intervaloMs}
              onChange={(e) => {
                setPerfil("customizado");
                setConfig((c) => ({ ...c, intervaloMs: Number(e.target.value) }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Tempo limite / tentativas</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={10}
                max={120}
                value={config.timeoutS}
                onChange={(e) => {
                  setPerfil("customizado");
                  setConfig((c) => ({ ...c, timeoutS: Number(e.target.value) }));
                }}
              />
              <Input
                type="number"
                min={0}
                max={3}
                value={config.retriesMax}
                onChange={(e) => {
                  setPerfil("customizado");
                  setConfig((c) => ({ ...c, retriesMax: Number(e.target.value) }));
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Máx. tokens do teste</Label>
            <Input
              type="number"
              min={1000}
              max={2000000}
              step={1000}
              value={config.maxTokens}
              onChange={(e) => {
                setPerfil("customizado");
                setConfig((c) => ({ ...c, maxTokens: Number(e.target.value) }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Créditos / mil tokens e teto de custo</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={config.creditosPorMilTokens}
                onChange={(e) => {
                  setPerfil("customizado");
                  setConfig((c) => ({ ...c, creditosPorMilTokens: Number(e.target.value) }));
                }}
              />
              <Input
                type="number"
                min={0}
                max={5000}
                step={1}
                value={config.maxCustoCreditos}
                onChange={(e) => {
                  setPerfil("customizado");
                  setConfig((c) => ({ ...c, maxCustoCreditos: Number(e.target.value) }));
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Custo estimado a partir dos tokens e da taxa informada — o provedor não devolve preço
              por chamada. 0 = sem limite de custo.
            </p>
          </div>
        </div>


        <div className="space-y-1.5">
          <Label>Cenários (um por linha)</Label>
          <Textarea rows={3} value={cenarios} onChange={(e) => setCenarios(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={usarLuna}
              onChange={(e) => setUsarLuna(e.target.checked)}
            />
            Gerar variações de linguagem com o gerador de mensagens sintéticas
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void iniciar(false)} disabled={rodando || !clinicaId}>
            {rodando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Iniciar teste de carga
          </Button>
          <Button variant="outline" onClick={() => void pararAgora()} disabled={!rodando}>
            <Square className="mr-2 h-4 w-4" /> Parar
          </Button>
          <span className="text-xs text-muted-foreground">
            {cfgPrevia.totalMensagens} mensagens · {cfgPrevia.conversasSimultaneas} simultâneas ·{" "}
            {cfgPrevia.mensagensPorMinuto} msg/min
          </span>
        </div>

        {preparo ? (
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {preparo.prontos >= preparo.total && preparo.total > 0 ? (
              <span>
                {preparo.prontos}/{preparo.total} — prontos · Iniciando teste...
              </span>
            ) : (
              <span>
                Preparando Leads de Teste... {preparo.prontos}/{preparo.total}
              </span>
            )}
          </div>
        ) : null}

        {erroPreparo ? (
          <div className="space-y-2 rounded-lg border border-destructive/40 p-3 text-sm">
            <p className="font-medium">Preparação falhou.</p>
            <p className="text-muted-foreground">{erroPreparo}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={rodando || !clinicaId}
              onClick={() => void iniciar(confirmadoRef.current)}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
            </Button>
          </div>
        ) : null}


        {detalhe ? (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{detalhe.carga.status}</Badge>
              <span className="text-sm">
                {detalhe.carga.enviadas}/{detalhe.carga.total_planejado} mensagens processadas
              </span>
            </div>
            <div className="grid gap-2 text-sm md:grid-cols-4">
              <div>Latência média: {ms(m?.media)}</div>
              <div>p50: {ms(m?.p50)}</div>
              <div>p95: {m?.p95 == null ? "volume insuficiente" : ms(m.p95)}</div>
              <div>p99: {m?.p99 == null ? "volume insuficiente" : ms(m.p99)}</div>
              <div>Msg/min medidas: {m?.mensagensPorMinutoReal?.toFixed(1) ?? "—"}</div>
              <div>Erros: {detalhe.carga.erros}</div>
              <div>Tempos esgotados: {detalhe.carga.timeouts}</div>
              <div>Tentativas repetidas: {detalhe.carga.retries}</div>
              <div>Chamadas do modelo: {detalhe.carga.chamadas_modelo}</div>
              <div>Ferramentas usadas: {detalhe.carga.ferramentas}</div>
              <div>
                Tokens: {detalhe.carga.input_tokens} entrada / {detalhe.carga.output_tokens} saída
              </div>
              <div>Conversas envolvidas: {m?.conversasEnvolvidas ?? "—"}</div>
            </div>
            <p className="text-xs text-muted-foreground">
              Custo em dinheiro não é medido: o provedor não devolve preço por chamada. Só os tokens
              são registrados.
            </p>
          </div>
        ) : null}

        {testes.length ? (
          <div className="space-y-2">
            <Label>Histórico</Label>
            <div className="divide-y rounded-lg border">
              {testes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void abrirDetalhe(t.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
                >
                  <span className="truncate">{t.nome}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{t.status}</Badge>
                    {t.enviadas}/{t.total_planejado}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar teste de alto volume</DialogTitle>
            <DialogDescription>
              Este teste vai disparar {cfgPrevia.totalMensagens} mensagens na homologação (acima do
              limite de {LIMITE_CONFIRMACAO} que dispensa confirmação). Nada vai para o WhatsApp
              real, mas o processamento consome o modelo de IA. Deseja continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void iniciar(true)}>Confirmar e iniciar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

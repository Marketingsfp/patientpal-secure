import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  FlaskConical,
  History,
  Loader2,
  MessageCircle,
  Mic,
  Network,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SemCaixaAlta } from "@/components/ui/caixa-alta";
import {
  ABAS_FRANCISCO,
  configPadraoFrancisco,
  franciscoConfigSchema,
  textoTemplateFrancisco,
  type AbaFrancisco,
  type FranciscoConfig,
} from "@/lib/francisco/config";
import { VOZES_NINA } from "@/lib/nina/voz-config";
import {
  carregarFrancisco,
  salvarFrancisco,
  listarFrancisco,
  contatoFrancisco,
  consultarContatoFrancisco,
  homologarFrancisco,
} from "@/lib/francisco/functions";
import type { ConfigRegistro, CursorFrancisco } from "@/lib/francisco/service.server";

const ICONES = [Bot, Network, Mic, MessageCircle, Clock3, FlaskConical, History];
const MOTIVOS: Record<string, string> = {
  elegivel: "Pronto para acompanhamento",
  anterior_ao_inicio: "Anterior ao início da campanha",
  orcamento_encerrado_ou_status_desconhecido: "Orçamento encerrado ou status não reconhecido",
  sem_valor: "Sem valor a pagar",
  orcamento_vencido: "Orçamento vencido",
  telefone_invalido: "Telefone inválido",
  sem_itens: "Orçamento sem itens",
  item_pago_parcial_ou_inaplicavel: "Pagamento, entrada ou item não aplicável",
  recebimento_registrado: "Recebimento registrado",
  recebimento_confirmado: "Recebimento confirmado",
  resposta_recebida: "Paciente já respondeu",
  sem_autorizacao: "Sem autorização de contato",
  aguardando_24h: "Aguardando 24 horas",
  cadencia_expirada: "Prazo do acompanhamento encerrado",
  etapa_desativada: "Etapa desativada",
  etapa_ja_reservada: "Etapa já processada",
  d1_nao_enviado: "Primeiro contato não enviado",
  limite_por_telefone: "Intervalo mínimo por telefone",
};
const formatoData = (v?: string) =>
  v
    ? new Date(v).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
const erroTexto = (e: unknown) =>
  e instanceof Error ? e.message : "Não foi possível concluir a operação.";
type Linha = Record<string, any>;
type Pagina = { itens: Linha[]; proximo: CursorFrancisco | null };
const NODES = [
  {
    id: "identidade",
    icon: Bot,
    titulo: "Identidade",
    texto: "Francisco · assistente de orçamentos",
  },
  { id: "cadencia", icon: Clock3, titulo: "Cadência", texto: "24h e 96h após criar o orçamento" },
  {
    id: "elegibilidade",
    icon: ShieldCheck,
    titulo: "Conferência",
    texto: "Financeiro, autorização e duplicidade",
  },
  {
    id: "mensagens",
    icon: MessageCircle,
    titulo: "WhatsApp",
    texto: "Templates aprovados pela Meta",
  },
  { id: "humano", icon: Users, titulo: "Equipe humana", texto: "Respostas e pagamentos" },
  {
    id: "modelo",
    icon: Settings2,
    titulo: "Modelo e instruções",
    texto: "Configuração própria e homologação",
  },
  { id: "voz", icon: Mic, titulo: "Voz", texto: "Prévia independente do Francisco" },
  {
    id: "historico",
    icon: History,
    titulo: "Histórico",
    texto: "Versões, testes, envios e respostas",
  },
];

export function FranciscoWorkspace({
  clinicaId,
  clinicaNome,
  preview = false,
}: {
  clinicaId: string;
  clinicaNome: string;
  preview?: boolean;
}) {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const aba: AbaFrancisco = ABAS_FRANCISCO.some((a) => a[0] === hash)
    ? (hash as AbaFrancisco)
    : "visao-geral";
  const carregar = useServerFn(carregarFrancisco),
    salvar = useServerFn(salvarFrancisco),
    listar = useServerFn(listarFrancisco);
  const registrarContato = useServerFn(contatoFrancisco),
    consultarContato = useServerFn(consultarContatoFrancisco),
    homologar = useServerFn(homologarFrancisco);
  const qc = useQueryClient();
  const [config, setConfig] = useState(configPadraoFrancisco);
  const [original, setOriginal] = useState(configPadraoFrancisco);
  const [registro, setRegistro] = useState<ConfigRegistro | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [node, setNode] = useState("identidade");
  const [tipoLista, setTipoLista] = useState<"candidatos" | "envios">("candidatos");
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const pedidoLista = useRef(0);
  const [erroLista, setErroLista] = useState("");
  const [listaOcupada, setListaOcupada] = useState(false);
  const [telefone, setTelefone] = useState("");
  const [evidencia, setEvidencia] = useState("");
  const [contato, setContato] = useState("");
  const [cenario, setCenario] = useState(
    "Paciente fez um orçamento ontem, ainda não pagou e autorizou o contato. Proponha uma mensagem breve de apresentação e ajuda.",
  );
  const [textoVoz, setTextoVoz] = useState(
    "Olá! Sou Francisco, assistente de orçamentos da clínica. Nossa equipe está à disposição para ajudar você.",
  );
  const [resultado, setResultado] = useState("");
  const [audio, setAudio] = useState<string | null>(null);
  const consulta = useQuery({
    queryKey: ["francisco-config", clinicaId, preview],
    queryFn: async () =>
      preview
        ? { registro: null, podeEditar: true, podePublicar: true, envioRealLiberado: false }
        : carregar({ data: { clinicaId } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!consulta.data) return;
    const r = consulta.data.registro;
    const c = r?.rascunho ?? configPadraoFrancisco();
    setRegistro(r);
    setConfig(c);
    setOriginal(c);
  }, [consulta.data]);
  const podeEditar = !!consulta.data?.podeEditar && !consulta.isError;
  const alterado = JSON.stringify(config) !== JSON.stringify(original);
  const publicado = registro?.publicado;
  const envioRealAtivo =
    consulta.data?.envioRealLiberado && publicado?.ativo && publicado.modo === "real";
  const set = <K extends keyof FranciscoConfig>(chave: K, valor: FranciscoConfig[K]) =>
    setConfig((c) => ({ ...c, [chave]: valor }));
  const acao = async (f: () => Promise<void>) => {
    setOcupado(true);
    try {
      await f();
    } catch (e) {
      toast.error(erroTexto(e));
    } finally {
      setOcupado(false);
    }
  };
  const gravar = (publicar: boolean) =>
    acao(async () => {
      const c = franciscoConfigSchema.parse(config);
      if (preview) {
        setOriginal(c);
        toast.success("Rascunho atualizado somente nesta prévia visual.");
        return;
      }
      const r = await salvar({
        data: { clinicaId, config: c, revisao: registro?.revisao ?? 0, publicar },
      });
      setRegistro(r);
      setOriginal(c);
      await qc.invalidateQueries({ queryKey: ["francisco-config", clinicaId] });
      toast.success(
        publicar
          ? "Configuração publicada."
          : "Rascunho salvo. A versão publicada permanece em uso.",
      );
    });
  async function carregarLista(proximo?: CursorFrancisco) {
    const pedido = ++pedidoLista.current;
    setListaOcupada(true);
    setErroLista("");
    try {
      const p: Pagina = preview
        ? { itens: [], proximo: null }
        : await listar({
            data: {
              clinicaId,
              tipo: aba === "historico" ? "historico" : tipoLista,
              cursor: proximo,
            },
          });
      if (pedido === pedidoLista.current) setPaginas((pgs) => (proximo ? [...pgs, p] : [p]));
    } catch (e) {
      if (pedido === pedidoLista.current) setErroLista(erroTexto(e));
    } finally {
      if (pedido === pedidoLista.current) setListaOcupada(false);
    }
  }
  useEffect(() => {
    pedidoLista.current++;
    setPaginas([]);
    if ((aba === "historico" || aba === "acompanhamento") && consulta.isSuccess)
      void carregarLista();
    // Cada clínica/aba tem seu próprio conjunto de páginas.
  }, [aba, tipoLista, clinicaId, consulta.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps
  const linhas = paginas.flatMap((p) => p.itens),
    proximo = paginas.at(-1)?.proximo;
  async function testar(tipo: "modelo" | "voz" | "templates") {
    await acao(async () => {
      if (preview) {
        setResultado(
          "Prévia visual: conecte a uma clínica para executar a homologação. Nenhuma chamada ao modelo ou WhatsApp foi realizada.",
        );
        return;
      }
      const r = await homologar({
        data: {
          clinicaId,
          config: franciscoConfigSchema.parse(config),
          tipo,
          texto: tipo === "voz" ? textoVoz : cenario,
        },
      });
      setResultado(r.texto);
      setAudio(r.base64 ? `data:${r.mime};base64,${r.base64}` : null);
    });
  }
  const campo = (label: string, input: ReactNode, ajuda?: string) => (
    <CampoFrancisco label={label} ajuda={ajuda}>
      {input}
    </CampoFrancisco>
  );
  const botaoAba = (destino: AbaFrancisco, texto: string) => (
    <Button variant="outline" asChild>
      <Link to={preview ? "/dev/francisco" : "/app/francisco"} hash={destino}>
        {texto}
        <ArrowRight className="size-4" />
      </Link>
    </Button>
  );
  function editorNode() {
    if (node === "identidade")
      return (
        <div className="space-y-4">
          {campo("Nome do agente", <Input value="Francisco" disabled />)}
          <p className="text-sm text-muted-foreground">
            Assistente dedicado ao acompanhamento de orçamentos. Apresenta-se no primeiro contato e
            encaminha respostas para a equipe humana.
          </p>
          {campo(
            "Departamento que recebe as respostas",
            <Input
              value={config.departamento}
              onChange={(e) => set("departamento", e.target.value)}
              disabled={!podeEditar}
            />,
          )}
        </div>
      );
    if (node === "modelo")
      return (
        <div className="space-y-4">
          {campo(
            "Modelo",
            <Input
              value={config.modelo}
              onChange={(e) => set("modelo", e.target.value)}
              disabled={!podeEditar}
            />,
            "Identificador do gateway usado na homologação.",
          )}
          {campo(
            "Temperatura",
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={config.temperatura}
              onChange={(e) => set("temperatura", Number(e.target.value))}
              disabled={!podeEditar}
            />,
            "Padrão: 1,0. Não modifica o texto dos templates aprovados.",
          )}
          {campo(
            "System prompt",
            <Textarea
              className="min-h-64 normal-case"
              value={config.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              disabled={!podeEditar}
            />,
          )}
        </div>
      );
    if (node === "cadencia")
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Primeiro contato · após 24 horas</Label>
            <Switch
              checked={config.d1}
              onCheckedChange={(v) => set("d1", v)}
              disabled={!podeEditar}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Segundo contato · após 96 horas</Label>
            <Switch
              checked={config.d4}
              onCheckedChange={(v) => set("d4", v)}
              disabled={!podeEditar}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Contagem a partir da criação do orçamento. O segundo contato exige o primeiro enviado
            quando D1 está habilitado. A sequência encerra após sete dias.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {campo(
              "Enviar a partir de",
              <Input
                type="time"
                value={config.inicio}
                onChange={(e) => set("inicio", e.target.value)}
                disabled={!podeEditar}
              />,
            )}
            {campo(
              "Enviar até",
              <Input
                type="time"
                value={config.fim}
                onChange={(e) => set("fim", e.target.value)}
                disabled={!podeEditar}
              />,
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d, i) => (
              <Button
                key={d}
                size="sm"
                variant={config.dias.includes(i + 1) ? "default" : "outline"}
                disabled={!podeEditar}
                onClick={() =>
                  set(
                    "dias",
                    config.dias.includes(i + 1)
                      ? config.dias.filter((v) => v !== i + 1)
                      : [...config.dias, i + 1],
                  )
                }
              >
                {d}
              </Button>
            ))}
          </div>
          {campo(
            "Máximo de envios por rodada",
            <Input
              type="number"
              min={1}
              max={40}
              value={config.limiteRodada}
              onChange={(e) => set("limiteRodada", Number(e.target.value))}
              disabled={!podeEditar}
            />,
          )}
          <p className="text-xs text-muted-foreground">
            Horário de Brasília. Leitura em lotes de 20, com intervalo mínimo de 24 horas por
            telefone.
          </p>
        </div>
      );
    if (node === "elegibilidade")
      return (
        <div className="space-y-4">
          <p className="text-sm">
            O financeiro é consultado antes de cada contato. Agendamento sozinho não comprova
            pagamento.
          </p>
          <ul className="space-y-3 text-sm text-muted-foreground">
            {[
              "Apenas orçamentos criados após a primeira publicação",
              "Orçamento aberto, válido e com itens e valor",
              "Telefone válido e autorização documentada",
              "Sem pagamento, entrada, recebimento ou isenção",
              "Sem resposta anterior, saída solicitada ou duplicidade",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                {t}
              </li>
            ))}
          </ul>
          {botaoAba("acompanhamento", "Ver acompanhamento")}
        </div>
      );
    if (node === "humano")
      return (
        <div className="space-y-4">
          {campo(
            "Departamento de destino",
            <Input
              value={config.departamento}
              onChange={(e) => set("departamento", e.target.value)}
              disabled={!podeEditar}
            />,
          )}
          <p className="text-sm text-muted-foreground">
            A resposta interrompe os próximos contatos. A equipe continua o atendimento e trata o
            pagamento. O orçamento permanece no módulo atual.
          </p>
        </div>
      );
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {node === "voz"
            ? "Selecione e ouça a voz própria do Francisco. Nesta etapa, os contatos ativos são enviados como templates de texto."
            : node === "mensagens"
              ? "Prepare os textos de D1 e D4 e confira a aprovação na Meta antes de ativar."
              : "Cada alteração, homologação e acompanhamento possui registro separado."}
        </p>
        {botaoAba(
          node === "voz" ? "voz" : node === "mensagens" ? "mensagens" : "historico",
          "Abrir configuração",
        )}
      </div>
    );
  }
  return (
    <SemCaixaAlta>
      <main className="mx-auto max-w-[1480px] space-y-6 p-4 md:p-7" data-francisco>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Bot className="size-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">Francisco</h1>
                <Badge variant="secondary">Orçamentos</Badge>
                {preview && <Badge variant="outline">Prévia visual</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Acompanhamento com atenção, no momento certo · {clinicaNome}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={envioRealAtivo ? "default" : "outline"}>
              {envioRealAtivo ? "Envio real configurado" : "Envios reais desativados"}
            </Badge>
            {alterado && <Badge variant="secondary">Alterações no rascunho</Badge>}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void gravar(false)}
              disabled={ocupado || !podeEditar || !alterado}
            >
              <Save className="size-4" />
              Salvar rascunho
            </Button>
            <Button
              size="sm"
              onClick={() => void gravar(true)}
              disabled={ocupado || !consulta.data?.podePublicar || consulta.isError}
            >
              <CheckCircle2 className="size-4" />
              Publicar configuração
            </Button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b pb-2" aria-label="Abas do Francisco">
          {ABAS_FRANCISCO.map(([id, label], i) => {
            const Icon = ICONES[i];
            return (
              <Button
                asChild
                key={id}
                variant={aba === id ? "secondary" : "ghost"}
                className="shrink-0"
              >
                <Link to={preview ? "/dev/francisco" : "/app/francisco"} hash={id}>
                  <Icon className="size-4" />
                  {label}
                </Link>
              </Button>
            );
          })}
        </nav>
        {consulta.isPending ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            Carregando Francisco…
          </div>
        ) : consulta.isError ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"
          >
            <p>{erroTexto(consulta.error)}</p>
            <Button variant="outline" className="mt-3" onClick={() => void consulta.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            {aba === "visao-geral" && (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    {
                      titulo: "Primeiro contato",
                      valor: "24 horas",
                      texto: "Após a criação do orçamento",
                      icon: Clock3,
                    },
                    {
                      titulo: "Segundo contato",
                      valor: "4º dia",
                      texto: "Se ainda não houver pagamento ou resposta",
                      icon: MessageCircle,
                    },
                    {
                      titulo: "Continuidade",
                      valor: "Equipe humana",
                      texto: "Respostas e pagamento pelo atendimento",
                      icon: Users,
                    },
                  ].map((x) => (
                    <Card key={x.titulo}>
                      <CardContent className="flex gap-4 pt-6">
                        <x.icon className="size-5 text-emerald-600" />
                        <div>
                          <p className="text-sm text-muted-foreground">{x.titulo}</p>
                          <p className="my-1 text-2xl font-semibold">{x.valor}</p>
                          <p className="text-xs text-muted-foreground">{x.texto}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                  <Card className="border-emerald-500/20">
                    <CardHeader>
                      <CardTitle>Do orçamento à conversa</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {[
                        {
                          n: "01",
                          t: "Orçamento criado",
                          d: "Francisco consulta o cadastro existente no Clínica OS.",
                        },
                        {
                          n: "02",
                          t: "Conferir antes de enviar",
                          d: "Pagamento, autorização e histórico decidem se o contato pode seguir.",
                        },
                        {
                          n: "03",
                          t: "Oferecer ajuda",
                          d: "Mensagem breve, com apresentação e opção de não receber novos contatos.",
                        },
                        {
                          n: "04",
                          t: "Continuar com uma pessoa",
                          d: "Quando o paciente responde, a sequência para e o atendimento humano assume.",
                        },
                      ].map((x) => (
                        <div key={x.n} className="flex gap-4">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-semibold text-emerald-600">
                            {x.n}
                          </span>
                          <div>
                            <p className="font-medium">{x.t}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{x.d}</p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Configuração da clínica</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Versão</span>
                        <span>
                          {registro ? `Revisão ${registro.revisao}` : "Ainda não publicada"}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Modo publicado</span>
                        <span>{publicado?.modo === "real" ? "Real" : "Simulação"}</span>
                      </div>
                      <div className="text-sm">
                        <p className="text-muted-foreground">Início da campanha</p>
                        <p className="mt-1">
                          {registro?.inicio_campanha
                            ? formatoData(registro.inicio_campanha)
                            : "Definido na primeira publicação"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
                        A implantação começa em simulação. Somente novos orçamentos entram na
                        campanha. Templates e autorização são conferidos antes da ativação.
                      </div>
                      {botaoAba("arquitetura", "Configurar arquitetura")}
                      {botaoAba("homologacao", "Abrir homologação")}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
            {aba === "arquitetura" && (
              <div className="grid items-start gap-5 xl:grid-cols-[1.65fr_1fr]">
                <Card className="overflow-hidden">
                  <CardHeader className="border-b">
                    <CardTitle className="flex items-center gap-2">
                      <Network className="size-5" />
                      Mapa do Francisco
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Selecione um componente para consultar ou editar.
                    </p>
                  </CardHeader>
                  <CardContent className="min-h-[480px] bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:20px_20px] p-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {NODES.map((n, i) => (
                        <button
                          type="button"
                          key={n.id}
                          onClick={() => setNode(n.id)}
                          className={`relative rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-emerald-500/70 ${node === n.id ? "border-emerald-500 ring-2 ring-emerald-500/15" : "border-border"}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
                              <n.icon className="size-5" />
                            </span>
                            <p className="font-medium">{n.titulo}</p>
                          </div>
                          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                            {n.texto}
                          </p>
                          {i < 4 && (
                            <ArrowDown className="absolute -bottom-4 right-1/2 z-10 size-4 text-muted-foreground" />
                          )}
                        </button>
                      ))}
                    </div>
                    <p className="mt-6 text-xs text-muted-foreground">
                      Orçamentos → conferência → template → WhatsApp → equipe humana
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{NODES.find((n) => n.id === node)?.titulo}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {editorNode()}
                    <div className="border-t pt-4 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label>Rotina habilitada</Label>
                          <p className="text-xs text-muted-foreground">Começa desativada.</p>
                        </div>
                        <Switch
                          checked={config.ativo}
                          onCheckedChange={(v) => set("ativo", v)}
                          disabled={!podeEditar}
                        />
                      </div>
                      {campo(
                        "Modo da rotina",
                        <select
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          value={config.modo}
                          onChange={(e) => set("modo", e.target.value as "real" | "simulacao")}
                          disabled={!podeEditar}
                        >
                          <option value="simulacao">Simulação</option>
                          <option value="real" disabled={!consulta.data?.envioRealLiberado}>
                            Envio real
                          </option>
                        </select>,
                        "Envio real depende também da liberação no servidor e dos templates aprovados.",
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
            {aba === "voz" && (
              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Voz do Francisco</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Preferências próprias, com prévia de áudio.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {campo(
                      "Voz",
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={config.voz.voz}
                        onChange={(e) =>
                          set("voz", {
                            ...config.voz,
                            voz: e.target.value as FranciscoConfig["voz"]["voz"],
                          })
                        }
                        disabled={!podeEditar}
                      >
                        {VOZES_NINA.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>,
                    )}
                    {campo(
                      "Velocidade",
                      <Input
                        type="number"
                        min={0.25}
                        max={4}
                        step={0.05}
                        value={config.voz.velocidade}
                        onChange={(e) =>
                          set("voz", { ...config.voz, velocidade: Number(e.target.value) })
                        }
                        disabled={!podeEditar}
                      />,
                    )}
                    {campo(
                      "Estilo",
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={config.voz.estilo}
                        onChange={(e) =>
                          set("voz", {
                            ...config.voz,
                            estilo: e.target.value as FranciscoConfig["voz"]["estilo"],
                          })
                        }
                        disabled={!podeEditar}
                      >
                        {["natural", "acolhedor", "tranquilo", "profissional", "animado"].map(
                          (v) => (
                            <option key={v}>{v}</option>
                          ),
                        )}
                      </select>,
                    )}
                    {campo(
                      "Orientações de voz",
                      <Textarea
                        className="normal-case"
                        value={config.voz.orientacoes}
                        onChange={(e) => set("voz", { ...config.voz, orientacoes: e.target.value })}
                        disabled={!podeEditar}
                      />,
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Ouvir uma prévia</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      aria-label="Texto da prévia de voz"
                      value={textoVoz}
                      onChange={(e) => setTextoVoz(e.target.value)}
                      className="min-h-32 normal-case"
                    />
                    <Button onClick={() => void testar("voz")} disabled={ocupado || !podeEditar}>
                      <Mic className="size-4" />
                      Gerar prévia
                    </Button>
                    {audio && <audio controls src={audio} className="w-full" />}
                    {resultado && (
                      <p role="status" className="text-sm text-muted-foreground">
                        {resultado}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Nesta versão, mensagens ativas usam templates de texto. A voz pode ser
                      configurada e testada, sem enviar áudio ao paciente.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
            {aba === "mensagens" && (
              <>
                <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                  O envio usa o texto aprovado pela Meta. O modelo não reescreve mensagens ativas. A
                  variável <code>{"{{1}}"}</code> recebe apenas o nome da clínica.
                </div>
                <div className="grid gap-5 xl:grid-cols-2">
                  {(["d1", "d4"] as const).map((etapa) => (
                    <Card key={etapa}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle>
                            {etapa === "d1" ? "Primeiro contato · D1" : "Segundo contato · D4"}
                          </CardTitle>
                          <Badge variant="outline">
                            {etapa === "d1" ? "Após 24h" : "Após 96h"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {campo(
                          "Nome do template na Meta",
                          <Input
                            value={config.templates[etapa].nome}
                            onChange={(e) =>
                              set("templates", {
                                ...config.templates,
                                [etapa]: { ...config.templates[etapa], nome: e.target.value },
                              })
                            }
                            disabled={!podeEditar}
                          />,
                        )}
                        {campo(
                          "Texto proposto · português (Brasil)",
                          <Textarea
                            className="min-h-36 normal-case"
                            value={config.templates[etapa].texto}
                            onChange={(e) =>
                              set("templates", {
                                ...config.templates,
                                [etapa]: { ...config.templates[etapa], texto: e.target.value },
                              })
                            }
                            disabled={!podeEditar}
                          />,
                        )}
                        <div className="rounded-2xl rounded-tl-sm border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm leading-relaxed">
                          {textoTemplateFrancisco(config, etapa, clinicaNome)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Aprovação e classificação do template são feitas na Meta. Esta tela não
                          submete nem envia mensagens.
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => void testar("templates")}
                  disabled={ocupado || !podeEditar}
                >
                  <ShieldCheck className="size-4" />
                  Conferir templates na Meta
                </Button>
                {resultado && (
                  <p role="status" className="text-sm">
                    {resultado}
                  </p>
                )}
              </>
            )}
            {aba === "acompanhamento" && (
              <div className="space-y-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Autorização de contato</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Registre uma autorização já obtida, com origem e data. O cadastro fica somente
                      no Francisco.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                      <Input
                        aria-label="Telefone para autorização"
                        placeholder="Telefone com DDD"
                        value={telefone}
                        onChange={(e) => setTelefone(e.target.value)}
                      />
                      <Input
                        aria-label="Evidência da autorização"
                        placeholder="Origem, data e como o paciente autorizou o contato"
                        value={evidencia}
                        onChange={(e) => setEvidencia(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={ocupado || !telefone}
                        onClick={() =>
                          void acao(async () => {
                            if (preview) {
                              setContato("Prévia visual: nenhuma autorização consultada.");
                              return;
                            }
                            const c = await consultarContato({ data: { clinicaId, telefone } });
                            setContato(
                              c
                                ? `${c.estado} · ${c.evidencia} · ${formatoData(c.updated_at)}`
                                : "Nenhuma autorização registrada para este telefone.",
                            );
                          })
                        }
                      >
                        Consultar
                      </Button>
                      {(["autorizado", "recusado"] as const).map((estado) => (
                        <Button
                          key={estado}
                          variant={estado === "autorizado" ? "default" : "outline"}
                          disabled={ocupado || !podeEditar || evidencia.trim().length < 10}
                          onClick={() =>
                            void acao(async () => {
                              if (preview) {
                                toast.info("Prévia visual: nenhum contato foi alterado.");
                                return;
                              }
                              await registrarContato({
                                data: { clinicaId, telefone, evidencia, estado },
                              });
                              setContato(`Contato ${estado}.`);
                              await carregarLista();
                            })
                          }
                        >
                          {estado === "autorizado" ? "Registrar autorização" : "Bloquear contato"}
                        </Button>
                      ))}
                    </div>
                    {contato && (
                      <p role="status" className="text-sm text-muted-foreground">
                        {contato}
                      </p>
                    )}
                  </CardContent>
                </Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <Button
                      variant={tipoLista === "candidatos" ? "secondary" : "ghost"}
                      onClick={() => setTipoLista("candidatos")}
                    >
                      Orçamentos em análise
                    </Button>
                    <Button
                      variant={tipoLista === "envios" ? "secondary" : "ghost"}
                      onClick={() => setTipoLista("envios")}
                    >
                      Envios
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    disabled={listaOcupada}
                    onClick={() => void carregarLista()}
                  >
                    <RefreshCw className="size-4" />
                    Atualizar
                  </Button>
                </div>
                {!registro?.inicio_campanha && tipoLista === "candidatos" && (
                  <p className="text-sm text-muted-foreground">
                    Publique a configuração em simulação para definir o início da campanha.
                    Orçamentos anteriores ficam fora do acompanhamento.
                  </p>
                )}
                {renderLista()}
              </div>
            )}
            {aba === "homologacao" && (
              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Testar o Francisco</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Use um cenário fictício. O teste chama o modelo com o rascunho atual, sem
                      enviar WhatsApp.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      aria-label="Cenário de homologação"
                      className="min-h-40 normal-case"
                      value={cenario}
                      onChange={(e) => setCenario(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={ocupado || !podeEditar}
                        onClick={() => void testar("modelo")}
                      >
                        {ocupado ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <FlaskConical className="size-4" />
                        )}
                        Testar resposta do modelo
                      </Button>
                      {botaoAba("acompanhamento", "Conferir elegibilidade")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Modelo: {config.modelo} · temperatura: {config.temperatura.toFixed(1)}
                      <br />
                      As mensagens reais continuam usando os templates aprovados.
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Resultado da homologação</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p role="status" className="whitespace-pre-wrap text-sm leading-relaxed">
                      {resultado ||
                        "Execute um cenário para conferir apresentação, tom e encaminhamento para a equipe humana."}
                    </p>
                  </CardContent>
                </Card>
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Critérios para ativar</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 text-sm md:grid-cols-3">
                    {[
                      "D1 e D4 respeitam a data do orçamento e o horário de envio.",
                      "Pagamento, entrada ou resposta interrompem a sequência.",
                      "Templates aprovados, contato autorizado e destino humano conferidos.",
                    ].map((t) => (
                      <p key={t} className="flex gap-2 text-muted-foreground">
                        <ShieldCheck className="size-5 shrink-0 text-emerald-600" />
                        {t}
                      </p>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
            {aba === "historico" && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">Trilha do Francisco</h2>
                    <p className="text-sm text-muted-foreground">
                      Configurações, autorizações, homologação e respostas.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={listaOcupada}
                    onClick={() => void carregarLista()}
                  >
                    <RefreshCw className="size-4" />
                    Atualizar
                  </Button>
                </div>
                {renderLista()}
              </>
            )}
          </>
        )}
        {ocupado && (
          <div
            role="status"
            className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border bg-background p-4 shadow-lg"
          >
            <Loader2 className="size-4 animate-spin" />
            Processando…
          </div>
        )}
      </main>
    </SemCaixaAlta>
  );
  function renderLista() {
    return (
      <Card>
        <CardContent className="pt-5">
          {erroLista && (
            <p role="alert" className="mb-4 text-sm text-destructive">
              {erroLista}
            </p>
          )}
          {linhas.length === 0 && !listaOcupada && !erroLista && (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-3 size-8 text-muted-foreground/60" />
              <p className="font-medium">
                {aba === "historico"
                  ? "Nenhum registro ainda"
                  : "Nenhum registro neste acompanhamento"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {aba === "historico"
                  ? "Os registros aparecerão conforme o Francisco for configurado e homologado."
                  : "Os orçamentos da campanha e os envios aparecerão aqui, em lotes de 20."}
              </p>
            </div>
          )}
          <div className="divide-y">
            {linhas.map((l) =>
              aba === "historico" ? (
                <details key={l.id} className="py-4">
                  <summary className="cursor-pointer text-sm">
                    <span className="mr-3 text-xs text-muted-foreground">
                      {formatoData(l.created_at)}
                    </span>
                    {String(l.tipo).replaceAll("_", " ")}
                    {l.dados?.revisao && (
                      <Badge variant="outline" className="ml-2">
                        Revisão {l.dados.revisao}
                      </Badge>
                    )}
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
                    {JSON.stringify(l.dados, null, 2)}
                  </pre>
                </details>
              ) : (
                <div
                  key={l.id ?? l.orcamento_id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div>
                    <p className="text-sm font-medium">
                      Orçamento {l.numero ?? l.orcamento_id?.slice(0, 8)}{" "}
                      <Badge variant="outline" className="ml-2">
                        {String(l.etapa).toUpperCase()}
                      </Badge>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Telefone: {l.telefone} · {formatoData(l.created_at)}
                    </p>
                  </div>
                  <div className="max-w-md text-sm">
                    <Badge variant={l.motivo === "elegivel" ? "default" : "secondary"}>
                      {MOTIVOS[l.motivo] ?? l.status ?? l.motivo}
                    </Badge>
                    {l.entrega && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {l.entrega === "read"
                          ? "Lida"
                          : l.entrega === "delivered"
                            ? "Entregue"
                            : l.entrega === "failed"
                              ? "Falha na entrega"
                              : "Enviada"}
                      </span>
                    )}
                    {l.respondido_em && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Paciente respondeu · sequência interrompida
                      </p>
                    )}
                    {l.status === "incerto" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Conferir o envio na Meta. Sem repetição automática.
                      </p>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
          {listaOcupada && (
            <div
              role="status"
              className="flex justify-center gap-2 py-5 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              Carregando 20 registros…
            </div>
          )}
          {proximo && (
            <Button
              variant="outline"
              className="mt-4 w-full"
              disabled={listaOcupada}
              onClick={() => void carregarLista(proximo)}
            >
              Carregar mais 20
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }
}
function CampoFrancisco({
  label,
  ajuda,
  children,
}: {
  label: string;
  ajuda?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

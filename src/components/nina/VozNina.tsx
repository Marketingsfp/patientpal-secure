import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mic, Play, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { useAuth } from "@/hooks/use-auth";
import { invalidateClinicFlags } from "@/lib/cache/clinic-flags-cache";
import { mostrarErro } from "@/lib/traduzir-erro";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  carregarVozNina,
  salvarVozNina,
  ouvirPreviaVozNina,
} from "@/lib/nina/voz-config.functions";
import {
  VOZES_NINA,
  ESTILOS_VOZ,
  VOZ_PADRAO,
  TEXTO_PREVIA_VOZ,
  vozConfigSchema,
  previaVozSchema,
  type VozConfig,
} from "@/lib/nina/voz-config";

export function VozNina() {
  const { clinicaAtual } = useClinica();
  const { session, loading } = useAuth();
  if (loading) return <p role="status">Carregando acesso…</p>;
  if (!clinicaAtual || !session) return <p>Selecione uma clínica para configurar a voz.</p>;
  return (
    <ConfiguracaoVoz
      key={`${clinicaAtual.clinica_id}:${session.user.id}`}
      clinicaId={clinicaAtual.clinica_id}
      usuarioId={session.user.id}
    />
  );
}

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";

function ConfiguracaoVoz({ clinicaId, usuarioId }: { clinicaId: string; usuarioId: string }) {
  const podeEscrever = usePodeEscrever("nina-voz");
  const carregar = useServerFn(carregarVozNina);
  const salvar = useServerFn(salvarVozNina);
  const ouvir = useServerFn(ouvirPreviaVozNina);
  const cache = useQueryClient();
  const chave = ["nina-voz", clinicaId, usuarioId];
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: chave,
    queryFn: () => carregar({ data: { clinicaId } }),
    staleTime: Infinity,
    retry: false,
  });
  const [rascunho, setRascunho] = useState<{ configuracao: VozConfig; audioAtivo: boolean } | null>(
    null,
  );
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [textoPrevia, setTextoPrevia] = useState(TEXTO_PREVIA_VOZ);
  const [urlAudio, setUrlAudio] = useState<string | null>(null);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (urlAudio) URL.revokeObjectURL(urlAudio);
    },
    [urlAudio],
  );
  const config = rascunho?.configuracao ?? data?.configuracao ?? VOZ_PADRAO;
  const audioAtivo = rascunho?.audioAtivo ?? data?.audioAtivo ?? true;
  const valido = vozConfigSchema.safeParse(config).success;
  const podeEditar = podeEscrever && !!data?.podeEditar;
  const bloqueado = salvando || gerando || isFetching || !podeEditar;
  const alterado =
    data &&
    (JSON.stringify(config) !== JSON.stringify(data.configuracao) ||
      audioAtivo !== data.audioAtivo);

  function alterar(patch: Partial<VozConfig>) {
    setRascunho({ configuracao: { ...config, ...patch }, audioAtivo });
    setUrlAudio(null);
    setErroPrevia(null);
  }
  async function aplicar() {
    if (!data || bloqueado || !valido) return;
    setSalvando(true);
    try {
      const r = await salvar({
        data: { clinicaId, configuracao: config, audioAtivo, revisaoEsperada: data.revisao },
      });
      cache.setQueryData(chave, r);
      invalidateClinicFlags(clinicaId);
      setRascunho(null);
      if (r.aviso) toast.warning(r.aviso);
      else toast.success("Voz salva para as próximas respostas no WhatsApp e na homologação.");
    } catch (e) {
      mostrarErro(e);
    } finally {
      if (vivo.current) setSalvando(false);
    }
  }
  async function gerarPrevia() {
    if (bloqueado || !valido || !previaVozSchema.safeParse(textoPrevia).success) return;
    setGerando(true);
    setUrlAudio(null);
    setErroPrevia(null);
    try {
      const r = await ouvir({ data: { clinicaId, configuracao: config, texto: textoPrevia } });
      if (!vivo.current) return;
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      setUrlAudio(URL.createObjectURL(new Blob([bytes], { type: r.mime })));
      if (r.aviso) toast.warning(r.aviso);
    } catch (e) {
      if (vivo.current)
        setErroPrevia(
          e instanceof Error ? e.message : "Não foi possível gerar a prévia. Tente novamente.",
        );
    } finally {
      if (vivo.current) setGerando(false);
    }
  }

  if (isPending)
    return (
      <p role="status" className="p-6">
        Carregando voz da Nina…
      </p>
    );
  if (error || !data)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Voz da Nina</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p role="alert">
            {error instanceof Error ? error.message : "Não foi possível carregar a configuração."}
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Mic className="h-6 w-6 text-primary" />
            Voz da Nina
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Personalize a fala e ouça antes de salvar. A configuração vale para esta clínica no
            WhatsApp e na homologação.
          </p>
        </div>
        <Badge variant="secondary">
          {alterado
            ? "Alterações não salvas"
            : audioAtivo
              ? "Áudio ativado"
              : "Respostas por texto"}
        </Badge>
      </header>
      {!podeEditar && (
        <p className="text-sm text-muted-foreground">
          Você pode consultar a configuração. Somente administradores podem alterar ou gerar
          prévias.
        </p>
      )}
      {data.origem === "configuracao_invalida" && (
        <p role="alert" className="text-sm text-destructive">
          A configuração salva é inválida. A Nina está usando a voz padrão Nova. Revise e salve
          novamente.
        </p>
      )}
      <Card>
        <CardContent className="flex items-center justify-between gap-4 pt-6">
          <div>
            <Label htmlFor="nina-voz-ativa" className="text-base">
              Responder em áudio
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Quando o paciente enviar áudio ou pedir para ouvir a resposta. Se ele preferir texto,
              a Nina respeita.
            </p>
          </div>
          <Switch
            id="nina-voz-ativa"
            checked={audioAtivo}
            disabled={bloqueado}
            onCheckedChange={(v) => setRascunho({ configuracao: config, audioAtivo: v })}
          />
        </CardContent>
      </Card>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Como a Nina fala</CardTitle>
            <CardDescription>
              Modelo de áudio: GPT-4o mini TTS. As opções usam o serviço de voz já integrado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="nina-voz-timbre">Voz</Label>
              <select
                id="nina-voz-timbre"
                className={selectClass}
                disabled={bloqueado}
                value={config.voz}
                onChange={(e) => alterar({ voz: e.target.value as VozConfig["voz"] })}
              >
                {VOZES_NINA.map((v) => (
                  <option key={v} value={v}>
                    {v[0]!.toUpperCase() + v.slice(1)}
                    {v === "nova" ? " (padrão)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Compare as vozes com o mesmo texto em português. A prévia verifica se o serviço
                consegue gerar a opção escolhida.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nina-voz-velocidade">Velocidade da fala</Label>
              <div className="flex items-center gap-3">
                <input
                  aria-label="Ajustar velocidade da fala"
                  type="range"
                  min="0.25"
                  max="4"
                  step="0.05"
                  className="min-w-0 flex-1 accent-primary"
                  disabled={bloqueado}
                  value={config.velocidade}
                  onChange={(e) => alterar({ velocidade: Number(e.target.value) })}
                />
                <Input
                  id="nina-voz-velocidade"
                  className="w-24"
                  type="number"
                  min={0.25}
                  max={4}
                  step={0.05}
                  disabled={bloqueado}
                  value={config.velocidade}
                  onChange={(e) => alterar({ velocidade: Number(e.target.value) })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                1× é a velocidade normal. Abaixo de 1 fica mais lenta; acima de 1, mais rápida.
                Faixa: 0,25× a 4×.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nina-voz-estilo">Estilo de fala</Label>
              <select
                id="nina-voz-estilo"
                className={selectClass}
                disabled={bloqueado}
                value={config.estilo}
                onChange={(e) => alterar({ estilo: e.target.value as VozConfig["estilo"] })}
              >
                {Object.entries(ESTILOS_VOZ).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nina-voz-orientacoes">Pronúncia, sotaque e entonação</Label>
              <Textarea
                id="nina-voz-orientacoes"
                rows={4}
                maxLength={2000}
                className="whitespace-pre-wrap break-words"
                disabled={bloqueado}
                value={config.orientacoes}
                placeholder="Ex.: Português brasileiro, com pausas naturais. Pronuncie as siglas letra por letra."
                onChange={(e) => alterar({ orientacoes: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Opcional. Oriente apenas a forma de falar. As regras de atendimento continuam no
                prompt da Nina. {config.orientacoes.length}/2000 caracteres.
              </p>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ouvir uma prévia</CardTitle>
              <CardDescription>
                Teste os ajustes da tela antes de salvar. O áudio é gerado por IA e toca somente
                aqui.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nina-voz-texto-previa">Texto de teste</Label>
                <Textarea
                  id="nina-voz-texto-previa"
                  rows={4}
                  maxLength={600}
                  className="whitespace-pre-wrap break-words"
                  disabled={bloqueado}
                  value={textoPrevia}
                  onChange={(e) => {
                    setTextoPrevia(e.target.value);
                    setUrlAudio(null);
                    setErroPrevia(null);
                  }}
                />
              </div>
              <Button
                variant="outline"
                disabled={bloqueado || !valido || !previaVozSchema.safeParse(textoPrevia).success}
                onClick={() => void gerarPrevia()}
              >
                <Play className="mr-2 h-4 w-4" />
                {gerando ? "Gerando áudio…" : "Gerar prévia"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Cada geração consome o serviço de áudio. Não salva a configuração nem envia
                mensagens a pacientes.
              </p>
              {gerando && (
                <p role="status" className="text-sm">
                  Preparando sua prévia…
                </p>
              )}
              {erroPrevia && (
                <p role="alert" className="text-sm text-destructive">
                  {erroPrevia}
                </p>
              )}
              {urlAudio && (
                <div className="space-y-2">
                  <audio
                    aria-label="Prévia da voz da Nina"
                    controls
                    src={urlAudio}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Prévia gerada. Ouça e confira a pronúncia antes de aplicar.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Respostas longas e listas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nina-voz-longas">Como entregar</Label>
                <select
                  id="nina-voz-longas"
                  className={selectClass}
                  disabled={bloqueado}
                  value={config.respostasLongas}
                  onChange={(e) =>
                    alterar({ respostasLongas: e.target.value as VozConfig["respostasLongas"] })
                  }
                >
                  <option value="resumo_texto">Áudio curto + texto completo (padrão)</option>
                  <option value="somente_texto">Somente texto completo</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nina-voz-limite">
                  Considerar longa acima de quantos caracteres?
                </Label>
                <Input
                  id="nina-voz-limite"
                  type="number"
                  min={100}
                  max={3000}
                  step={1}
                  disabled={bloqueado}
                  value={config.limiteResumo}
                  onChange={(e) => alterar({ limiteResumo: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">
                  De 100 a 3000; padrão 350. Listas também recebem esse tratamento para facilitar a
                  leitura dos detalhes.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Se houver falha na geração da voz, o paciente recebe a resposta por texto.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      {!valido && (
        <p role="alert" className="text-sm text-destructive">
          Confira a velocidade (0,25 a 4) e o limite de caracteres (100 a 3000, número inteiro).
        </p>
      )}
      <footer className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        {podeEditar && (
          <>
            <Button
              disabled={
                bloqueado || !valido || (!alterado && data.origem !== "configuracao_invalida")
              }
              onClick={() => void aplicar()}
            >
              <Save className="mr-2 h-4 w-4" />
              {salvando ? "Salvando…" : "Salvar configuração"}
            </Button>
            <Button
              variant="outline"
              disabled={bloqueado}
              onClick={() => {
                setRascunho({ configuracao: { ...VOZ_PADRAO }, audioAtivo });
                setUrlAudio(null);
                setErroPrevia(null);
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restaurar voz padrão
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          disabled={salvando || gerando || isFetching}
          onClick={() => {
            setRascunho(null);
            setUrlAudio(null);
            void refetch();
          }}
        >
          {alterado ? "Descartar e recarregar" : "Recarregar"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {data.revisao
            ? `Última alteração: ${new Date(data.revisao).toLocaleString("pt-BR")}.`
            : "Usando a configuração padrão."}{" "}
          Salvar aplica às próximas respostas.
        </p>
      </footer>
    </div>
  );
}

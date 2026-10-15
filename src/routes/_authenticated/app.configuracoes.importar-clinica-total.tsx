import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  interpretarLinha,
  lerLinhas,
  loteCheio,
  type LinhaLida,
} from "@/lib/importacao-legado/leitor-jsonl";

export const Route = createFileRoute("/_authenticated/app/configuracoes/importar-clinica-total")({
  component: Pagina,
  head: () => ({ meta: [{ title: "Importar Clínica Total — ClinicaOS" }] }),
});

/** Policlínica São Francisco de Paula: unidade padrão desta importação. */
const CLINICA_SFP = "1d3c4f34-2a0f-40fa-b39a-3609677a11a5";

const ETAPAS = [
  { tipo: "profissionais", rotulo: "1. Profissionais", arquivo: "profissionais.jsonl" },
  { tipo: "pessoas", rotulo: "2. Pessoas (clientes)", arquivo: "pessoas_v2.jsonl" },
  { tipo: "prontuarios", rotulo: "3. Prontuários", arquivo: "prontuarios.jsonl" },
  { tipo: "observacoes", rotulo: "4. Observações", arquivo: "observacoes.jsonl" },
] as const;
type Tipo = (typeof ETAPAS)[number]["tipo"];

type Execucao = {
  id: string;
  tipo: string;
  arquivo_nome: string;
  arquivo_tamanho: number;
  ultima_linha: number;
  lidas: number;
  inseridas: number;
  atualizadas: number;
  ignoradas: number;
  orfaos: number;
  erros: number;
  status: string;
  updated_at: string;
};

function Pagina() {
  const { memberships, clinicaAtual, loading } = useClinica();
  const admins = memberships.filter((m) => m.role === "admin");
  const [clinicaId, setClinicaId] = useState<string | null>(null);

  useEffect(() => {
    if (clinicaId || loading) return;
    const sfp = admins.find((m) => m.clinica_id === CLINICA_SFP);
    setClinicaId(sfp?.clinica_id ?? clinicaAtual?.clinica_id ?? null);
  }, [admins, clinicaAtual, clinicaId, loading]);

  const resumo = useQuery({
    queryKey: ["imp-legado-resumo", clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("importacao_legado_resumo", {
        _clinica: clinicaId!,
      });
      if (error) throw new Error(error.message);
      return data as Record<string, number>;
    },
  });

  const execucoes = useQuery({
    queryKey: ["imp-legado-exec", clinicaId],
    enabled: !!clinicaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("importacao_legado_execucoes")
        .select("*")
        .eq("clinica_id", clinicaId!)
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as Execucao[];
    },
  });

  if (loading) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Importar Clínica Total</h1>
        <p className="text-sm text-muted-foreground">
          Traz clientes, prontuários e observações do sistema antigo. Siga a ordem das etapas. Pode
          fechar a aba: ao escolher o mesmo arquivo de novo, a importação continua de onde parou.
          Rodar o mesmo arquivo duas vezes não duplica nada.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <span className="text-sm font-medium">Unidade de destino:</span>
          <Select value={clinicaId ?? undefined} onValueChange={setClinicaId}>
            <SelectTrigger className="w-80">
              <SelectValue placeholder="Escolha a unidade" />
            </SelectTrigger>
            <SelectContent>
              {admins.map((m) => (
                <SelectItem key={m.clinica_id} value={m.clinica_id}>
                  {m.clinica.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {admins.length === 0 && (
            <span className="text-sm text-destructive">
              Somente administrador da unidade pode importar.
            </span>
          )}
        </CardContent>
      </Card>

      {resumo.error && (
        <p className="text-sm text-destructive">{(resumo.error as Error).message}</p>
      )}

      {clinicaId && !resumo.error && (
        <>
          {ETAPAS.map((etapa, i) => {
            const lista = execucoes.data ?? [];
            const anteriorOk =
              i === 0 ||
              lista.some((e) => e.tipo === ETAPAS[i - 1].tipo && e.status === "concluido");
            return (
              <EtapaCard
                key={`${clinicaId}-${etapa.tipo}`}
                clinicaId={clinicaId}
                tipo={etapa.tipo}
                rotulo={etapa.rotulo}
                arquivo={etapa.arquivo}
                liberada={anteriorOk}
                execucoes={lista.filter((e) => e.tipo === etapa.tipo)}
              />
            );
          })}
          <ProfissionaisNaoCasados clinicaId={clinicaId} />
          <Resumo dados={resumo.data} />
        </>
      )}
    </div>
  );
}

/** Arquivo de pessoas precisa trazer o campo "chave" (número da pasta). Devolve o motivo ou null. */
async function conferirCampoChave(arquivo: File): Promise<string | null> {
  let n = 0;
  for await (const texto of lerLinhas(arquivo.stream())) {
    n += 1;
    const linha = interpretarLinha(texto, n);
    if (!linha) continue;
    if ("d" in linha) {
      return "chave" in linha.d
        ? null
        : 'Este arquivo não tem o campo "chave" (número da pasta). Use o arquivo pessoas_v2.jsonl.';
    }
    if (n > 20) break;
  }
  return 'Não foi possível conferir o campo "chave" no início do arquivo.';
}

const vazio = { lidas: 0, inseridas: 0, atualizadas: 0, ignoradas: 0, orfaos: 0, erros: 0 };

function EtapaCard(props: {
  clinicaId: string;
  tipo: Tipo;
  rotulo: string;
  arquivo: string;
  liberada: boolean;
  execucoes: Execucao[];
}) {
  const qc = useQueryClient();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [exec, setExec] = useState<Execucao | null>(null);
  const [rodando, setRodando] = useState(false);
  const [lidoBytes, setLidoBytes] = useState(0);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [terminouLeitura, setTerminouLeitura] = useState(false);
  const pausar = useRef(false);

  const concluida = props.execucoes.some((e) => e.status === "concluido");
  const ultima = exec ?? props.execucoes[props.execucoes.length - 1] ?? null;
  const contadores = ultima ?? { ...vazio };
  const pct = arquivo && arquivo.size > 0 ? Math.min(100, (lidoBytes / arquivo.size) * 100) : 0;

  const atualizar = () => {
    void qc.invalidateQueries({ queryKey: ["imp-legado-exec", props.clinicaId] });
    void qc.invalidateQueries({ queryKey: ["imp-legado-resumo", props.clinicaId] });
    void qc.invalidateQueries({ queryKey: ["imp-legado-prof", props.clinicaId] });
  };

  async function enviar(execId: string, linhas: LinhaLida[], linhaFinal: number) {
    let tentativa = 0;
    for (;;) {
      const { data, error } = await supabase.rpc("importacao_legado_lote", {
        _execucao: execId,
        _linha_final: linhaFinal,
        _linhas: linhas as never,
      });
      if (!error) {
        const total = (data as { total?: Execucao }).total;
        if (total) setExec(total);
        return;
      }
      tentativa += 1;
      if (tentativa >= 3) throw new Error(error.message);
      await new Promise((r) => setTimeout(r, 2000 * tentativa));
    }
  }

  async function executar() {
    if (!arquivo) return;
    setRodando(true);
    setMensagem(null);
    setTerminouLeitura(false);
    pausar.current = false;
    setLidoBytes(0);
    try {
      if (props.tipo === "pessoas") {
        const motivo = await conferirCampoChave(arquivo);
        if (motivo) {
          setMensagem(motivo);
          return;
        }
      }
      const { data, error } = await supabase.rpc("importacao_legado_iniciar", {
        _clinica: props.clinicaId,
        _tipo: props.tipo,
        _arquivo_nome: arquivo.name,
        _arquivo_tamanho: arquivo.size,
      });
      if (error) throw new Error(error.message);
      const ex = data as unknown as Execucao;
      setExec(ex);
      if (ex.status === "concluido") {
        setMensagem("Este arquivo já foi importado e a etapa está concluída.");
        return;
      }
      const jaConfirmada = ex.ultima_linha;
      let n = 0;
      let lote: LinhaLida[] = [];
      let bytesLote = 0;
      for await (const texto of lerLinhas(arquivo.stream(), (b) => setLidoBytes((x) => x + b))) {
        n += 1;
        if (n <= jaConfirmada) continue;
        const linha = interpretarLinha(texto, n);
        if (linha) {
          lote.push(linha);
          bytesLote += texto.length;
        }
        if (loteCheio(lote.length, bytesLote)) {
          await enviar(ex.id, lote, n);
          lote = [];
          bytesLote = 0;
          if (pausar.current) {
            setMensagem(`Pausado na linha ${n}. Clique em "Iniciar / continuar" para seguir.`);
            atualizar();
            return;
          }
        }
      }
      if (n > jaConfirmada) await enviar(ex.id, lote, n);
      if (props.tipo === "pessoas") {
        setMensagem("Preenchendo responsáveis…");
        for (;;) {
          const r = await supabase.rpc("importacao_legado_aplicar_responsaveis", {
            _clinica: props.clinicaId,
            _limite: 2000,
          });
          if (r.error) throw new Error(r.error.message);
          if (((r.data as { restantes?: number })?.restantes ?? 0) === 0) break;
        }
        setMensagem("Dando número novo a quem ficou sem pasta válida…");
        for (;;) {
          const r = await supabase.rpc("importacao_legado_numerar_pendentes", {
            _clinica: props.clinicaId,
            _limite: 2000,
          });
          if (r.error) throw new Error(r.error.message);
          if (((r.data as { restantes?: number })?.restantes ?? 0) === 0) break;
        }
      }
      setTerminouLeitura(true);
      setMensagem("Arquivo lido até o fim. Confira os números e clique em Concluir etapa.");
    } catch (e) {
      setMensagem(
        `Parou por erro: ${(e as Error).message}. Clique em "Iniciar / continuar" para tentar de novo.`,
      );
    } finally {
      setRodando(false);
      atualizar();
    }
  }

  async function concluir() {
    if (!ultima) return;
    const { error } = await supabase.rpc("importacao_legado_concluir", { _execucao: ultima.id });
    if (error) toast.error(error.message);
    else {
      toast.success("Etapa concluída");
      atualizar();
    }
  }

  async function baixarErros() {
    if (!ultima) return;
    const linhas: string[] = ["linha;tipo;chave;motivo"];
    let desde = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("importacao_legado_erros")
        .select("id, linha, tipo, chave, motivo")
        .eq("execucao_id", ultima.id)
        .gt("id", desde)
        .order("id")
        .limit(1000);
      if (error) {
        toast.error(error.message);
        return;
      }
      if (!data || data.length === 0) break;
      for (const r of data) {
        const campo = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        linhas.push([r.linha, r.tipo, campo(r.chave), campo(r.motivo)].join(";"));
      }
      desde = data[data.length - 1].id;
      if (data.length < 1000) break;
    }
    const blob = new Blob(["\uFEFF" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `erros-${props.tipo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className={props.liberada ? "" : "opacity-60"}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {props.rotulo}{" "}
          <span className="text-sm font-normal text-muted-foreground">({props.arquivo})</span>
        </CardTitle>
        {concluida ? (
          <Badge>Concluída</Badge>
        ) : ultima ? (
          <Badge variant="secondary">Em andamento</Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {!props.liberada ? (
          <p className="text-sm text-muted-foreground">Conclua a etapa anterior para liberar.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept=".jsonl,.json,.txt"
                disabled={rodando}
                onChange={(e) => {
                  setArquivo(e.target.files?.[0] ?? null);
                  setExec(null);
                  setMensagem(null);
                  setTerminouLeitura(false);
                }}
                className="text-sm"
              />
              <Button
                size="sm"
                disabled={!arquivo || rodando || concluida}
                onClick={() => void executar()}
              >
                Iniciar / continuar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!rodando}
                onClick={() => (pausar.current = true)}
              >
                Pausar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={rodando || !ultima || concluida}
                onClick={() => void concluir()}
              >
                Concluir etapa
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!ultima}
                onClick={() => void baixarErros()}
              >
                Baixar log de erros
              </Button>
            </div>
            {arquivo && <Progress value={pct} />}
            <div className="grid grid-cols-3 gap-2 text-sm md:grid-cols-7">
              <Num rotulo="Última linha" valor={ultima?.ultima_linha ?? 0} />
              <Num rotulo="Lidas" valor={contadores.lidas} />
              <Num rotulo="Inseridas" valor={contadores.inseridas} />
              <Num rotulo="Atualizadas" valor={contadores.atualizadas} />
              <Num rotulo="Ignoradas" valor={contadores.ignoradas} />
              <Num rotulo="Sem paciente" valor={contadores.orfaos} />
              <Num rotulo="Erros" valor={contadores.erros} />
            </div>
            {ultima && !exec && !concluida && (
              <p className="text-xs text-muted-foreground">
                Última execução: {ultima.arquivo_nome}. Escolha o mesmo arquivo para continuar da
                linha {ultima.ultima_linha + 1}.
              </p>
            )}
            {mensagem && <p className="text-sm">{mensagem}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Num({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="font-semibold tabular-nums">{valor.toLocaleString("pt-BR")}</div>
    </div>
  );
}

function ProfissionaisNaoCasados({ clinicaId }: { clinicaId: string }) {
  const qc = useQueryClient();
  const profs = useQuery({
    queryKey: ["imp-legado-prof", clinicaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("importacao_legado_profissionais")
        .select("codigo_pessoa, nome, medico_id, sem_medico, casado_por")
        .eq("clinica_id", clinicaId)
        .order("nome");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const medicos = useQuery({
    queryKey: ["imp-legado-medicos", clinicaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("medicos")
        .select("id, nome")
        .eq("clinica_id", clinicaId)
        .order("nome");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const pendentes = useMemo(
    () =>
      (profs.data ?? []).filter((p) => !p.medico_id || p.casado_por === "manual" || p.sem_medico),
    [profs.data],
  );
  if (!profs.data || profs.data.length === 0) return null;

  async function associar(codigo: string, valor: string) {
    const sem = valor === "__sem";
    const { error } = await supabase.rpc("importacao_legado_associar_profissional", {
      _clinica: clinicaId,
      _codigo_pessoa: codigo,
      _medico_id: (sem ? null : valor) as string,
      _sem_medico: sem,
    });
    if (error) toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["imp-legado-prof", clinicaId] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Profissionais não encontrados automaticamente (
          {pendentes.filter((p) => !p.medico_id && !p.sem_medico).length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Associe ao médico certo ou deixe "Sem médico" (o nome do profissional fica escrito no
          prontuário). Faça isso antes da etapa de prontuários.
        </p>
        {pendentes.map((p) => (
          <div key={p.codigo_pessoa} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-72 truncate">
              {p.nome ?? "(sem nome)"}{" "}
              <span className="text-muted-foreground">#{p.codigo_pessoa}</span>
            </span>
            <Select
              value={p.sem_medico ? "__sem" : (p.medico_id ?? undefined)}
              onValueChange={(v) => void associar(p.codigo_pessoa, v)}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Escolher médico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__sem">Sem médico</SelectItem>
                {(medicos.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const ROTULOS_RESUMO: Record<string, string> = {
  profissionais: "Profissionais lidos",
  profissionais_casados: "Profissionais ligados a médico",
  pacientes_importados: "Clientes do sistema antigo",
  pacientes_inativos: "…dos quais inativos",
  responsaveis_aplicados: "Responsáveis preenchidos",
  responsaveis_nao_encontrados: "Responsáveis não encontrados",
  responsaveis_pendentes: "Responsáveis pendentes",
  numeros_novos_gerados: "Números de prontuário novos (pasta vazia/repetida)",
  numeros_pendentes: "…aguardando número",
  campos_extras_guardados: "Campos extras guardados (mãe, pai, obs.)",
  prontuarios_importados: "Prontuários importados",
  prontuarios_sem_medico: "…sem médico",
  observacoes_importadas: "Observações importadas",
};

function Resumo({ dados }: { dados?: Record<string, number> }) {
  if (!dados) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resumo para conferir com a origem</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
        {Object.entries(ROTULOS_RESUMO).map(([k, r]) => (
          <div key={k} className="flex justify-between border-b py-1">
            <span>{r}</span>
            <span className="font-semibold tabular-nums">
              {(dados[k] ?? 0).toLocaleString("pt-BR")}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

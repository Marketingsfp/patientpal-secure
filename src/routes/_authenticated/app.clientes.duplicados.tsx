import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExternalLink, Merge, Trash2, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClinica } from "@/hooks/use-clinica";
import { usePodeEscrever } from "@/hooks/use-permissoes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/clientes/duplicados")({
  head: () => ({
    meta: [{ title: "Pacientes duplicados — conferência" }],
  }),
  component: DuplicadosPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6">
      <p className="text-destructive mb-3">Erro: {String(error)}</p>
      <Button onClick={() => reset()}>Tentar novamente</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Página não encontrada.</div>,
});

type PacienteDup = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  codigo_prontuario: string | null;
  codigo_prontuario_anterior?: string | null;
  email?: string | null;
  created_at: string;
  // Contagens vindas da RPC. Podem faltar enquanto o banco não estiver
  // atualizado — nesse caso a tela não afirma nada sobre o histórico.
  qtd_agendamentos?: number | null;
  qtd_prontuarios?: number | null;
  qtd_financeiro?: number | null;
  qtd_outros?: number | null;
  qtd_vinculos?: number | null;
};

type Grupo = {
  clinica_id: string;
  tipo: "cpf" | "telefone" | "nome_dn" | "nome" | "nome_truncado";
  chave: string;
  qtd: number;
  ids: string[];
  pacientes: PacienteDup[];
};

/** Retorno de contar_vinculos_paciente: varredura de todas as tabelas. */
type Vinculos = {
  paciente_id: string;
  total: number;
  detalhes: Array<{ tabela: string; coluna: string; qtd: number }>;
};

/** Grupos por página. A busca é paginada no banco, não no navegador. */
const POR_PAGINA = 50;

/**
 * O que a opção "Todos" busca. São os três tipos confiáveis e rápidos.
 * Os dois tipos por semelhança de nome ficam de fora porque precisam comparar
 * com estes três para não repetir grupo, e por isso estouram o limite de tempo
 * do banco — continuam disponíveis escolhendo o tipo na lista.
 */
const TIPOS_EM_TODOS: Grupo["tipo"][] = ["cpf", "telefone", "nome_dn"];

const TIPO_LABEL: Record<Grupo["tipo"], string> = {
  cpf: "Mesmo CPF",
  telefone: "Mesmo telefone",
  nome_dn: "Mesmo nome + nascimento",
  nome: "Mesmo nome (um cadastro incompleto)",
  // Resíduo da importação: o sistema antigo cortava o nome em 25 letras, e
  // quem já tinha cadastro ganhou um segundo, com o nome pela metade e sem
  // CPF. Nenhuma das outras regras achava esses casos, porque todas exigem
  // ou o mesmo CPF ou o mesmo nome.
  nome_truncado: "Nome cortado na importação",
};

/** Nome legível das tabelas que impedem a exclusão. */
const TABELA_LABEL: Record<string, string> = {
  agendamentos: "Agendamentos",
  agendamento_historico_notas: "Notas de agendamento",
  alertas_enfermagem: "Alertas de enfermagem",
  anamnese_respostas: "Anamneses",
  atend_conversas: "Conversas de atendimento",
  boletos: "Boletos",
  contrato_dependentes: "Dependentes de contrato",
  contratos_assinatura: "Contratos",
  crm_oportunidades: "Oportunidades de CRM",
  documentos_emitidos: "Documentos emitidos",
  exame_resultados: "Resultados de exame",
  fin_atendimentos: "Atendimentos no financeiro",
  fin_lancamentos: "Lançamentos financeiros",
  fin_notas_pacientes: "Notas do financeiro",
  lgpd_consentimentos: "Consentimentos LGPD",
  lgpd_solicitacoes: "Solicitações LGPD",
  mkt_envios: "Envios de marketing",
  mkt_leads: "Leads de marketing",
  nfse: "Notas fiscais",
  odonto_anamnese: "Anamnese odontológica",
  odonto_dentes: "Odontograma",
  odonto_evolucoes: "Evoluções odontológicas",
  odonto_prontuarios: "Prontuários odontológicos",
  orcamentos: "Orçamentos",
  paciente_biometria: "Biometria",
  pagamentos: "Pagamentos",
  prontuarios: "Prontuários",
  senhas: "Senhas de atendimento",
  triagens_enfermagem: "Triagens de enfermagem",
};

/** Formata CPF apenas para exibição (000.000.000-00). */
function formatCPF(v?: string | null): string {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length !== 11) return v ?? "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Formata telefone apenas para exibição ((21) 99532-4717). */
function formatPhone(v?: string | null): string {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? "—";
}

/** Data ISO (yyyy-mm-dd) em dd/mm/aaaa. */
function formatData(v?: string | null): string {
  if (!v) return "—";
  return v.slice(0, 10).split("-").reverse().join("/");
}

/** Chave do grupo formatada conforme o tipo de duplicidade. */
function formatChave(g: Grupo): string {
  if (g.tipo === "cpf") return formatCPF(g.chave);
  if (g.tipo === "telefone") return formatPhone(g.chave);
  if (g.tipo === "nome") return g.chave;
  // A chave é o nome como ficou cortado na importação; as reticências deixam
  // claro que o cadastro de baixo é o mesmo nome, porém completo.
  if (g.tipo === "nome_truncado") return g.chave + "…";
  const [nome, dn] = g.chave.split("|");
  return `${nome}${dn ? ` · ${formatData(dn)}` : ""}`;
}

/** Soma dos vínculos conhecidos; null quando a RPC ainda não informa. */
function totalVinculos(p: PacienteDup): number | null {
  if (typeof p.qtd_vinculos === "number") return p.qtd_vinculos;
  const partes = [p.qtd_agendamentos, p.qtd_prontuarios, p.qtd_financeiro, p.qtd_outros];
  if (partes.every((n) => typeof n !== "number")) return null;
  return partes.reduce<number>((acc, n) => acc + (typeof n === "number" ? n : 0), 0);
}

function DuplicadosPage() {
  const { clinicaIds } = useClinica();
  // "Leitura" no módulo mostra a conferência; só "Edição" libera mesclar/excluir.
  const podeMesclar = usePodeEscrever("clientes-duplicados");
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);
  const [temMais, setTemMais] = useState(false);
  // Abre já em "Mesmo nome + nascimento": é o tipo com mais casos reais e o
  // mais barato de calcular. "Todos" varre mais coisa e pode estourar o tempo.
  const [tipo, setTipo] = useState<"" | Grupo["tipo"]>("nome_dn");
  const [filtroNome, setFiltroNome] = useState("");
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  // Exclusão de um cadastro isolado
  const [excluirAlvo, setExcluirAlvo] = useState<PacienteDup | null>(null);
  const [vinculos, setVinculos] = useState<Vinculos | null>(null);
  const [vinculosErro, setVinculosErro] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const buscarTipo = (alvo: Grupo["tipo"], proxima: number) =>
    supabase.rpc("listar_duplicados_pacientes", {
      _clinica_ids: clinicaIds,
      _tipo: alvo,
      _limite: POR_PAGINA,
      _offset: proxima * POR_PAGINA,
    });

  const reload = (proxima = 0) => {
    if (clinicaIds.length === 0) return;
    setLoading(true);
    setErro(null);

    // "Todos" vira três buscas em paralelo, uma por tipo, em vez de uma só.
    // Cada varredura da tabela de pacientes leva alguns segundos; as três
    // juntas numa requisição só estouram o limite de 8s do banco, mas
    // separadas cada uma tem o seu próprio limite e todas cabem.
    const alvos: Grupo["tipo"][] = tipo ? [tipo] : TIPOS_EM_TODOS;

    Promise.all(alvos.map((alvo) => buscarTipo(alvo, proxima))).then((respostas) => {
      setLoading(false);

      const falha = respostas.find((r) => r.error)?.error;
      if (falha) {
        // Sem isto o erro só ia para o console e a tela dizia "nenhum grupo
        // encontrado", que é indistinguível de não haver duplicados.
        console.error(falha);
        setErro(
          falha.code === "57014"
            ? "A busca demorou mais que o limite do banco e foi interrompida. Escolha um tipo específico na lista ao lado."
            : falha.message || "Não foi possível carregar os duplicados.",
        );
        if (proxima === 0) setGrupos([]);
        setTemMais(false);
        return;
      }

      const lotes = respostas.map((r) => (r.data ?? []) as unknown as Grupo[]);
      // Maiores grupos primeiro, que é a ordem que o banco já usa dentro de
      // cada tipo — aqui só reordena a junção dos três.
      const lote = lotes.flat().sort((a, b) => b.qtd - a.qtd);
      setGrupos((atual) => (proxima === 0 ? lote : [...atual, ...lote]));
      setTemMais(lotes.some((l) => l.length === POR_PAGINA));
      setPagina(proxima);
    });
  };

  useEffect(() => {
    setGrupos([]);
    setPagina(0);
    setTemMais(false);
    reload(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicaIds, tipo]);

  const groupKey = (g: Grupo, i: number) => `${g.tipo}-${g.chave}-${i}`;

  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036F]/g, "")
      .toLowerCase()
      .trim();
  const gruposFiltrados = (() => {
    const q = norm(filtroNome);
    if (!q) return grupos;
    return grupos.filter((g) => g.pacientes.some((p) => norm(p.nome ?? "").includes(q)));
  })();

  const toggle = (gk: string, id: string) => {
    setSel((prev) => {
      const cur = new Set(prev[gk] ?? []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      return { ...prev, [gk]: cur };
    });
  };

  const grupoAtual = confirmKey
    ? (grupos.find((g, i) => groupKey(g, i) === confirmKey) ?? null)
    : null;
  const selecionadosAtuais = confirmKey ? Array.from(sel[confirmKey] ?? []) : [];
  const pacientesSelecionados = grupoAtual
    ? grupoAtual.pacientes.filter((p) => selecionadosAtuais.includes(p.id))
    : [];
  // Vencedor previsto: menor codigo_prontuario numérico; empate = mais antigo
  const vencedorPrevisto = (() => {
    if (pacientesSelecionados.length < 2) return null;
    const withNum = pacientesSelecionados
      .map((p) => {
        const raw = p.codigo_prontuario ?? "";
        const isNum = /^\d+$/.test(raw);
        return { p, num: isNum ? Number(raw) : Number.POSITIVE_INFINITY, raw };
      })
      .sort((a, b) => {
        if (a.num !== b.num) return a.num - b.num;
        if (a.raw && b.raw && a.raw !== b.raw) return a.raw.localeCompare(b.raw);
        return (a.p.created_at ?? "").localeCompare(b.p.created_at ?? "");
      });
    return withNum[0]?.p ?? null;
  })();

  // Conflitos: CPFs diferentes (não vazios) ou datas de nascimento diferentes
  const conflitos = (() => {
    const cpfs = new Set(
      pacientesSelecionados
        .map((p) => (p.cpf ?? "").replace(/\D/g, ""))
        .filter((v) => v.length === 11),
    );
    const dns = new Set(
      pacientesSelecionados.map((p) => p.data_nascimento).filter(Boolean) as string[],
    );
    const lista: string[] = [];
    if (cpfs.size > 1)
      lista.push(`CPFs diferentes: ${Array.from(cpfs).map(formatCPF).join(" · ")}`);
    if (dns.size > 1)
      lista.push(`Datas de nascimento diferentes: ${Array.from(dns).map(formatData).join(" · ")}`);
    return lista;
  })();
  const [cienteConflito, setCienteConflito] = useState(false);

  const executarMerge = async () => {
    if (!podeMesclar) {
      toast.error("Você não tem permissão para mesclar cadastros.");
      return;
    }
    if (!vencedorPrevisto || selecionadosAtuais.length < 2) return;
    if (conflitos.length > 0 && !cienteConflito) {
      toast.error("Confirme que está ciente das diferenças antes de mesclar.");
      return;
    }
    setMerging(true);
    const { data, error } = await supabase.rpc("merge_pacientes", {
      _ids: selecionadosAtuais,
    });
    setMerging(false);
    if (error) {
      toast.error(error.message || "Não foi possível mesclar");
      return;
    }
    toast.success(`Pacientes mesclados. Vencedor: ${String(data).slice(0, 8)}…`);
    setConfirmKey(null);
    setCienteConflito(false);
    setSel({});
    reload();
  };

  /** Abre a conferência de exclusão: confere o histórico antes de perguntar. */
  const abrirExclusao = async (p: PacienteDup) => {
    if (!podeMesclar) {
      toast.error("Você não tem permissão para excluir cadastros.");
      return;
    }
    setExcluirAlvo(p);
    setVinculos(null);
    setVinculosErro(null);
    setConferindo(true);
    const { data, error } = await supabase.rpc("contar_vinculos_paciente", {
      _id: p.id,
    });
    setConferindo(false);
    if (error) {
      setVinculosErro(error.message || "Não foi possível conferir o histórico deste cadastro.");
      return;
    }
    setVinculos(data as unknown as Vinculos);
  };

  const fecharExclusao = () => {
    setExcluirAlvo(null);
    setVinculos(null);
    setVinculosErro(null);
    setConferindo(false);
  };

  const executarExclusao = async () => {
    if (!excluirAlvo || !vinculos || vinculos.total > 0) return;
    setExcluindo(true);
    const { error } = await supabase.rpc("excluir_paciente_duplicado", {
      _id: excluirAlvo.id,
    });
    setExcluindo(false);
    if (error) {
      toast.error(error.message || "Não foi possível excluir o cadastro");
      return;
    }
    toast.success(`Cadastro de ${excluirAlvo.nome} excluído.`);
    fecharExclusao();
    setSel({});
    reload();
  };

  const podeExcluirAlvo = !!vinculos && vinculos.total === 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Possíveis pacientes duplicados</h1>
          <p className="text-sm text-muted-foreground">
            Somente alerta. O sistema não faz merge automático — confira cada cadastro antes de
            mesclar ou excluir.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={filtroNome}
            onChange={(e) => setFiltroNome(e.target.value)}
            placeholder="Filtrar por nome…"
            className="h-9 w-64"
          />
          <select
            className="border rounded px-2 py-1 text-sm bg-background"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "" | Grupo["tipo"])}
          >
            <option value="">Todos (CPF, telefone, nome + nascimento)</option>
            <option value="cpf">Mesmo CPF</option>
            <option value="telefone">Mesmo telefone</option>
            <option value="nome_dn">Mesmo nome + nascimento</option>
            <option value="nome">Mesmo nome (cadastro incompleto)</option>
            <option value="nome_truncado">Nome cortado na importação</option>
          </select>
        </div>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {erro && (
        <p className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-xl px-3 py-2">
          {erro}
        </p>
      )}
      {!loading && !erro && gruposFiltrados.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum grupo suspeito encontrado.</p>
      )}
      <div className="grid gap-3">
        {gruposFiltrados.map((g, i) => (
          <Card key={groupKey(g, i)} className="rounded-2xl border-border/50 shadow-2xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-primary/10 text-primary font-medium px-3 py-1 rounded-full text-xs">
                    {TIPO_LABEL[g.tipo]}
                  </span>
                  <CardTitle className="text-base font-semibold tracking-tight">
                    {formatChave(g)}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">{g.qtd} cadastros</span>
                </div>
                <button
                  type="button"
                  disabled={!podeMesclar || (sel[groupKey(g, i)]?.size ?? 0) < 2}
                  title={podeMesclar ? undefined : "Seu perfil tem acesso somente de leitura aqui."}
                  onClick={() => setConfirmKey(groupKey(g, i))}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Merge className="h-3.5 w-3.5" />
                  Mesclar selecionados
                  <span className="bg-primary-foreground/20 rounded-full px-1.5 py-0.5 text-[11px] font-bold">
                    {sel[groupKey(g, i)]?.size ?? 0}
                  </span>
                </button>
              </div>
              {g.tipo === "nome" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Mesmo nome, e pelo menos um cadastro sem CPF ou sem telefone. Confira a data de
                  nascimento antes de mesclar — pode ser xará.
                </p>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              <div>
                {g.pacientes.map((p) => {
                  const total = totalVinculos(p);
                  const semHistorico = total === 0;
                  return (
                    <div
                      key={p.id}
                      className="bg-card border border-border/50 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between gap-4 mb-3"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <Checkbox
                          checked={sel[groupKey(g, i)]?.has(p.id) ?? false}
                          onCheckedChange={() => toggle(groupKey(g, i), p.id)}
                        />
                        <div className="min-w-0">
                          <div className="text-base font-bold text-foreground truncate">
                            {p.nome}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">
                            CPF: {formatCPF(p.cpf)} · Tel: {formatPhone(p.telefone)} · Nasc.:{" "}
                            {formatData(p.data_nascimento)}
                            {p.codigo_prontuario ? ` · Prontuário: ${p.codigo_prontuario}` : ""}
                          </div>
                          {total !== null && (
                            <div className="text-xs mt-1">
                              {semHistorico ? (
                                <span className="text-muted-foreground">
                                  Sem agendamento, prontuário ou financeiro — pode ser excluído
                                </span>
                              ) : (
                                <span className="text-foreground">
                                  Agenda: {p.qtd_agendamentos ?? 0} · Prontuário:{" "}
                                  {p.qtd_prontuarios ?? 0} · Financeiro: {p.qtd_financeiro ?? 0}
                                  {(p.qtd_outros ?? 0) > 0 ? ` · Outros: ${p.qtd_outros}` : ""}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          to="/app/clientes/$pacienteId/editar"
                          params={{ pacienteId: p.id }}
                          className="border border-border/60 hover:bg-muted font-medium text-xs rounded-xl px-3 py-1.5 flex items-center gap-1.5 text-foreground transition-colors whitespace-nowrap"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Abrir cadastro
                        </Link>
                        <button
                          type="button"
                          disabled={!podeMesclar}
                          title={
                            podeMesclar
                              ? "Excluir este cadastro. Só conclui se ele não tiver nenhum histórico."
                              : "Seu perfil tem acesso somente de leitura aqui."
                          }
                          onClick={() => abrirExclusao(p)}
                          className="border border-destructive/40 text-destructive hover:bg-destructive/10 font-medium text-xs rounded-xl px-3 py-1.5 flex items-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir cadastro
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {temMais && !erro && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={() => reload(pagina + 1)}
            className="border border-border rounded-xl px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Carregando…" : "Carregar mais grupos"}
          </button>
          <span className="text-xs text-muted-foreground">
            {grupos.length} grupos carregados
          </span>
        </div>
      )}

      <AlertDialog
        open={!!confirmKey}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmKey(null);
            setCienteConflito(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar merge de pacientes</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Esta ação é <strong>irreversível</strong>. Todos os vínculos (agenda,
                  atendimentos, financeiro, contratos, prontuários, cartões) dos cadastros
                  perdedores serão movidos para o vencedor, e os cadastros perdedores serão
                  apagados.
                </p>
                {conflitos.length > 0 && (
                  <div className="rounded border border-destructive/40 bg-destructive/10 p-2 space-y-2">
                    <div className="font-semibold text-destructive">
                      Atenção: os cadastros selecionados têm dados divergentes
                    </div>
                    <ul className="list-disc pl-5 text-xs">
                      {conflitos.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <Checkbox
                        checked={cienteConflito}
                        onCheckedChange={(v) => setCienteConflito(v === true)}
                      />
                      Confirmo que conferi e são a mesma pessoa
                    </label>
                  </div>
                )}
                {vencedorPrevisto && (
                  <div className="rounded border bg-muted/40 p-2">
                    <div className="font-medium">Vencedor (menor prontuário):</div>
                    <div>{vencedorPrevisto.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      Prontuário {vencedorPrevisto.codigo_prontuario ?? "—"} • CPF{" "}
                      {vencedorPrevisto.cpf ?? "—"} • Tel {vencedorPrevisto.telefone ?? "—"}
                    </div>
                  </div>
                )}
                <div>
                  <div className="font-medium">
                    Perdedores ({pacientesSelecionados.length - 1}):
                  </div>
                  <ul className="list-disc pl-5">
                    {pacientesSelecionados
                      .filter((p) => p.id !== vencedorPrevisto?.id)
                      .map((p) => (
                        <li key={p.id}>
                          {p.nome} — Prontuário {p.codigo_prontuario ?? "—"}
                        </li>
                      ))}
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">
                  Campos vazios do vencedor (CPF, telefone, e-mail, data de nascimento) serão
                  preenchidos com dados dos perdedores. Números de prontuário e demais
                  identificadores legados não são alterados.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={merging || (conflitos.length > 0 && !cienteConflito)}
              onClick={executarMerge}
            >
              {merging ? "Mesclando…" : "Confirmar merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!excluirAlvo}
        onOpenChange={(o) => {
          if (!o) fecharExclusao();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cadastro duplicado</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {excluirAlvo && (
                  <div className="rounded border bg-muted/40 p-2">
                    <div className="font-medium">{excluirAlvo.nome}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      CPF: {formatCPF(excluirAlvo.cpf)} · Tel: {formatPhone(excluirAlvo.telefone)} ·
                      Nasc.: {formatData(excluirAlvo.data_nascimento)}
                      {excluirAlvo.codigo_prontuario
                        ? ` · Prontuário: ${excluirAlvo.codigo_prontuario}`
                        : ""}
                    </div>
                  </div>
                )}

                {conferindo && <p>Conferindo o histórico deste cadastro…</p>}

                {vinculosErro && (
                  <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                    {vinculosErro}
                  </div>
                )}

                {vinculos && vinculos.total === 0 && (
                  <p>
                    Este cadastro{" "}
                    <strong>não tem nenhum agendamento, prontuário ou movimento financeiro</strong>{" "}
                    vinculado. A exclusão é definitiva, mas nenhum histórico será perdido. A ação
                    fica registrada na auditoria.
                  </p>
                )}

                {vinculos && vinculos.total > 0 && (
                  <div className="rounded border border-destructive/40 bg-destructive/10 p-2 space-y-2">
                    <div className="font-semibold text-destructive flex items-center gap-1.5">
                      <TriangleAlert className="h-4 w-4" />
                      Este cadastro tem histórico e não pode ser excluído
                    </div>
                    <ul className="list-disc pl-5 text-xs">
                      {vinculos.detalhes.map((d) => (
                        <li key={`${d.tabela}-${d.coluna}`}>
                          {TABELA_LABEL[d.tabela] ?? d.tabela}: {d.qtd}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs">
                      Para juntar este cadastro ao correto sem perder nada, selecione os dois na
                      lista e use <strong>Mesclar selecionados</strong>.
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>
              {podeExcluirAlvo ? "Cancelar" : "Fechar"}
            </AlertDialogCancel>
            {podeExcluirAlvo && (
              <AlertDialogAction
                disabled={excluindo}
                onClick={(e) => {
                  e.preventDefault();
                  void executarExclusao();
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {excluindo ? "Excluindo…" : "Excluir definitivamente"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

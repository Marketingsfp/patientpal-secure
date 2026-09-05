/**
 * Configurações → Mensagens rápidas.
 *
 * Cadastro das respostas usadas com "/" no atendimento. Mensagem rápida é um
 * atalho interno de digitação — NÃO é template oficial do WhatsApp/Meta.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Zap, Plus, Pencil, Trash2, Search, Star, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
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
import { confirmDialog } from "@/lib/confirm";
import { mostrarErro } from "@/lib/traduzir-erro";
import { useClinica } from "@/hooks/use-clinica";
import {
  notificarRespostasAtualizadas,
  useRespostasRapidas,
} from "@/components/nina/RespostasRapidas";
import {
  CATEGORIAS_SUGERIDAS,
  VARIAVEIS_SUPORTADAS,
  normalizarComando,
  previewComExemplos,
  validarComando,
  type EscopoResposta,
  type RespostaRapida,
} from "@/lib/atendimento/respostas-rapidas";
import {
  excluirRespostaRapida,
  salvarRespostaRapida,
} from "@/lib/atendimento/respostas-rapidas.functions";

export const Route = createFileRoute("/_authenticated/app/configuracoes/respostas-rapidas")({
  component: RespostasRapidasPage,
  head: () => ({
    meta: [
      { title: "Mensagens rápidas — ClinicaOS" },
      {
        name: "description",
        content:
          "Cadastre as respostas rápidas usadas com o comando / no atendimento por WhatsApp.",
      },
      { property: "og:title", content: "Mensagens rápidas — ClinicaOS" },
      {
        property: "og:description",
        content: "Padronize respostas recorrentes do atendimento com comandos /.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Form = {
  id: string | null;
  nome: string;
  comando: string;
  conteudo: string;
  categoria: string;
  ativo: boolean;
  escopo: EscopoResposta;
};

const VAZIO: Form = {
  id: null,
  nome: "",
  comando: "",
  conteudo: "",
  categoria: "",
  ativo: true,
  escopo: "clinica",
};

function RespostasRapidasPage() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const dados = useRespostasRapidas(clinicaId);
  const salvarFn = useServerFn(salvarRespostaRapida);
  const excluirFn = useServerFn(excluirRespostaRapida);

  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState<Form>(VAZIO);
  const [salvando, setSalvando] = useState(false);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = [...dados.respostas].sort((a, b) => a.comando.localeCompare(b.comando, "pt-BR"));
    if (!q) return base;
    return base.filter((r) =>
      [r.comando, r.nome, r.conteudo, r.categoria ?? ""].some((c) => c.toLowerCase().includes(q)),
    );
  }, [dados.respostas, busca]);

  const podeEditar = (r: RespostaRapida) =>
    r.escopo === "pessoal" ? true : dados.podeGerenciar;

  function abrirNovo() {
    setForm({ ...VAZIO, escopo: dados.podeGerenciar ? "clinica" : "pessoal" });
    setAberto(true);
  }
  function abrirEdicao(r: RespostaRapida) {
    setForm({
      id: r.id,
      nome: r.nome,
      comando: r.comando,
      conteudo: r.conteudo,
      categoria: r.categoria ?? "",
      ativo: r.ativo,
      escopo: r.escopo,
    });
    setAberto(true);
  }

  async function salvar() {
    if (!clinicaId) return;
    const erro = validarComando(form.comando);
    if (erro) {
      toast.error(erro);
      return;
    }
    if (form.nome.trim().length < 2) {
      toast.error("Informe um nome para a mensagem rápida.");
      return;
    }
    if (!form.conteudo.trim()) {
      toast.error("Escreva o conteúdo da mensagem.");
      return;
    }
    setSalvando(true);
    try {
      await salvarFn({
        data: {
          clinicaId,
          id: form.id,
          nome: form.nome.trim(),
          comando: normalizarComando(form.comando),
          conteudo: form.conteudo,
          categoria: form.categoria.trim() || null,
          ativo: form.ativo,
          escopo: form.escopo,
        },
      });
      toast.success("Mensagem rápida salva.");
      setAberto(false);
      dados.recarregar();
      notificarRespostasAtualizadas();
    } catch (e) {
      mostrarErro(e);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(r: RespostaRapida) {
    if (!clinicaId) return;
    const ok = await confirmDialog({
      title: `Excluir /${r.comando}?`,
      description: "A mensagem rápida deixará de aparecer no atendimento.",
      confirmText: "Excluir",
    });
    if (!ok) return;
    try {
      await excluirFn({ data: { clinicaId, id: r.id } });
      toast.success("Mensagem rápida excluída.");
      dados.recarregar();
      notificarRespostasAtualizadas();
    } catch (e) {
      mostrarErro(e);
    }
  }

  async function alternarAtivo(r: RespostaRapida, ativo: boolean) {
    if (!clinicaId) return;
    try {
      await salvarFn({
        data: {
          clinicaId,
          id: r.id,
          nome: r.nome,
          comando: r.comando,
          conteudo: r.conteudo,
          categoria: r.categoria,
          ativo,
          escopo: r.escopo,
        },
      });
      dados.recarregar();
      notificarRespostasAtualizadas();
    } catch (e) {
      mostrarErro(e);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Mensagens rápidas</h1>
        <Badge variant="outline">Atalhos internos</Badge>
        <Button className="ml-auto" onClick={abrirNovo}>
          <Plus className="mr-1 h-4 w-4" /> Nova mensagem
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Respostas rápidas são atalhos de digitação usados na conversa com o comando{" "}
          <code>/</code>. Elas <strong>não</strong> são templates oficiais do WhatsApp (Meta) e
          não reabrem a janela de 24 horas.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Cadastradas</CardTitle>
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por comando, nome, texto ou categoria"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Buscar mensagens rápidas"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {dados.carregando && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          )}
          {!dados.carregando && lista.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma mensagem rápida cadastrada ainda. Sugestões de comandos: /valor, /endereco,
              /documentos, /confirmacao, /pagamento, /horario. O conteúdo deve ser escrito pela
              clínica.
            </p>
          )}
          {lista.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
            >
              <button
                type="button"
                aria-label={dados.favoritos.has(r.id) ? "Desfavoritar" : "Favoritar"}
                aria-pressed={dados.favoritos.has(r.id)}
                className="rounded p-1 hover:bg-muted"
                onClick={() => dados.favoritar(r.id, !dados.favoritos.has(r.id))}
              >
                <Star
                  className={`h-4 w-4 ${dados.favoritos.has(r.id) ? "fill-current text-amber-500" : "text-muted-foreground"}`}
                />
              </button>
              <code className="font-semibold">/{r.comando}</code>
              <span className="truncate">{r.nome}</span>
              {r.categoria && <Badge variant="secondary">{r.categoria}</Badge>}
              {r.escopo === "pessoal" && <Badge variant="outline">Pessoal</Badge>}
              <div className="ml-auto flex items-center gap-2">
                <Label className="text-xs text-muted-foreground" htmlFor={`ativo-${r.id}`}>
                  {r.ativo ? "Ativa" : "Inativa"}
                </Label>
                <Switch
                  id={`ativo-${r.id}`}
                  checked={r.ativo}
                  disabled={!podeEditar(r)}
                  onCheckedChange={(v) => void alternarAtivo(r, v)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!podeEditar(r)}
                  onClick={() => abrirEdicao(r)}
                  aria-label={`Editar /${r.comando}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!podeEditar(r)}
                  onClick={() => void excluir(r)}
                  aria-label={`Excluir /${r.comando}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar mensagem rápida" : "Nova mensagem rápida"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="rr-nome">Nome</Label>
                <Input
                  id="rr-nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Endereço da unidade"
                />
              </div>
              <div>
                <Label htmlFor="rr-comando">Comando</Label>
                <Input
                  id="rr-comando"
                  value={form.comando}
                  onChange={(e) => setForm({ ...form, comando: e.target.value })}
                  onBlur={(e) => setForm({ ...form, comando: normalizarComando(e.target.value) })}
                  placeholder="endereco"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Sem espaços, letras minúsculas, números e “_”. Ex.: /valor_consulta
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="rr-categoria">Categoria</Label>
                <Select
                  value={form.categoria || "__nenhuma"}
                  onValueChange={(v) =>
                    setForm({ ...form, categoria: v === "__nenhuma" ? "" : v })
                  }
                >
                  <SelectTrigger id="rr-categoria">
                    <SelectValue placeholder="Sem categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhuma">Sem categoria</SelectItem>
                    {CATEGORIAS_SUGERIDAS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rr-escopo">Disponível para</Label>
                <Select
                  value={form.escopo}
                  onValueChange={(v) => setForm({ ...form, escopo: v as EscopoResposta })}
                >
                  <SelectTrigger id="rr-escopo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clinica" disabled={!dados.podeGerenciar}>
                      Toda a clínica
                    </SelectItem>
                    <SelectItem value="pessoal">Somente eu</SelectItem>
                  </SelectContent>
                </Select>
                {!dados.podeGerenciar && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Você pode criar apenas mensagens pessoais.
                  </p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="rr-conteudo">Mensagem</Label>
              <Textarea
                id="rr-conteudo"
                rows={6}
                value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                placeholder="Escreva a mensagem. Use variáveis como {{patient.first_name}} quando fizer sentido."
              />
              <div className="mt-1 flex flex-wrap gap-1">
                {VARIAVEIS_SUPORTADAS.map((v) => (
                  <button
                    key={v.chave}
                    type="button"
                    className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                    onClick={() =>
                      setForm((f) => ({ ...f, conteudo: `${f.conteudo}{{${v.chave}}}` }))
                    }
                  >
                    {`{{${v.chave}}}`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Prévia (valores de exemplo)</Label>
              <div className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                {previewComExemplos(form.conteudo) || "—"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="rr-ativo"
                checked={form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
              />
              <Label htmlFor="rr-ativo">Ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={salvando}>
              {salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

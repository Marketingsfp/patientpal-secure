/**
 * Nina → Aprendizado: fila de revisão da memória da Nina.
 *
 * Nada aqui altera o comportamento da Nina sozinho: um aprendizado só entra no
 * prompt depois de APROVADO por administrador/gestor da clínica.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Brain, Check, Loader2, Plus, Search, ThumbsUp, X, Archive } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { useClinica } from "@/hooks/use-clinica";
import {
  definirStatusAprendizado,
  estatisticasAprendizado,
  listarAprendizados,
  salvarAprendizado,
} from "@/lib/nina/aprendizado.functions";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "ARCHIVED";

interface Linha {
  id: string;
  tipo: string;
  canal: string;
  titulo: string;
  conteudo: string;
  tags: string[] | null;
  status: Status;
  confianca: number;
  versao: number;
  origem: string;
  usos: number;
  updated_at: string;
}

const TIPO_LABEL: Record<string, string> = {
  FACT: "Fato",
  RULE: "Regra",
  WORKFLOW: "Fluxo",
  EXAMPLE: "Exemplo",
  ERROR_PATTERN: "Erro recorrente",
  KNOWLEDGE_GAP: "Lacuna",
};

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Aguardando revisão",
  APPROVED: "Em uso pela Nina",
  REJECTED: "Recusado",
  ARCHIVED: "Arquivado",
};

export default function NinaAprendizado() {
  const { clinicaAtual } = useClinica();
  const clinicaId = clinicaAtual?.clinica_id;
  const listar = useServerFn(listarAprendizados);
  const salvar = useServerFn(salvarAprendizado);
  const definirStatus = useServerFn(definirStatusAprendizado);
  const stats = useServerFn(estatisticasAprendizado);

  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [resumo, setResumo] = useState<{
    total: number;
    pendentes: number;
    aprovados: number;
    usos: number;
    feedback30d: number;
    satisfacao30d: number | null;
  } | null>(null);
  const [status, setStatus] = useState<Status | "TODOS">("PENDING");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [editando, setEditando] = useState<Partial<Linha> | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!clinicaId) return;
    setCarregando(true);
    try {
      const [rows, r] = await Promise.all([
        listar({
          data: {
            clinicaId,
            ...(status !== "TODOS" ? { status } : {}),
            ...(busca.trim() ? { busca: busca.trim() } : {}),
          },
        }),
        stats({ data: { clinicaId } }),
      ]);
      setLinhas(rows as unknown as Linha[]);
      setResumo(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar aprendizados");
    } finally {
      setCarregando(false);
    }
  }, [clinicaId, status, busca, listar, stats]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const mudar = async (id: string, novo: Status) => {
    if (!clinicaId) return;
    try {
      await definirStatus({ data: { clinicaId, id, status: novo } });
      toast.success(
        novo === "APPROVED" ? "Aprendizado ativado para a Nina" : "Situação atualizada",
      );
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar");
    }
  };

  const gravar = async () => {
    if (!clinicaId || !editando) return;
    if (!editando.titulo?.trim() || !editando.conteudo?.trim()) {
      toast.error("Preencha título e conteúdo");
      return;
    }
    setSalvando(true);
    try {
      await salvar({
        data: {
          clinicaId,
          ...(editando.id ? { id: editando.id } : {}),
          tipo: (editando.tipo as any) ?? "FACT",
          canal: (editando.canal as any) ?? "todos",
          titulo: editando.titulo.trim(),
          conteudo: editando.conteudo.trim(),
          tags: editando.tags ?? [],
        },
      });
      toast.success(editando.id ? "Aprendizado atualizado" : "Aprendizado criado (aguardando aprovação)");
      setEditando(null);
      void carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  const cards = useMemo(
    () => [
      { label: "Aguardando revisão", valor: resumo?.pendentes ?? 0 },
      { label: "Em uso pela Nina", valor: resumo?.aprovados ?? 0 },
      { label: "Vezes usados", valor: resumo?.usos ?? 0 },
      {
        label: "Satisfação (30 dias)",
        valor: resumo?.satisfacao30d === null || resumo?.satisfacao30d === undefined
          ? "—"
          : `${resumo.satisfacao30d}%`,
      },
    ],
    [resumo],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-semibold">{c.valor}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-5 w-5 text-emerald-500" /> Aprendizado da Nina
              </CardTitle>
              <CardDescription>
                A Nina só usa o que estiver aprovado aqui. Preços, horários e agenda continuam
                vindo do sistema — o aprendizado ensina o jeito de responder e as regras da casa.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setEditando({ tipo: "FACT", canal: "todos" })}>
              <Plus className="h-4 w-4 mr-1" /> Novo aprendizado
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por título ou conteúdo"
                className="pl-8"
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as Status | "TODOS")}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Aguardando revisão</SelectItem>
                <SelectItem value="APPROVED">Em uso pela Nina</SelectItem>
                <SelectItem value="REJECTED">Recusados</SelectItem>
                <SelectItem value="ARCHIVED">Arquivados</SelectItem>
                <SelectItem value="TODOS">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {carregando ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : linhas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nada por aqui ainda. Avalie as respostas da Nina no chat (👍 / 👎) para alimentar
              esta fila, ou crie um aprendizado manualmente.
            </p>
          ) : (
            <div className="space-y-2">
              {linhas.map((l) => (
                <div key={l.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{TIPO_LABEL[l.tipo] ?? l.tipo}</Badge>
                    <Badge variant={l.status === "APPROVED" ? "default" : "secondary"}>
                      {STATUS_LABEL[l.status]}
                    </Badge>
                    {l.canal !== "todos" && <Badge variant="outline">{l.canal}</Badge>}
                    <span className="text-xs text-muted-foreground">
                      v{l.versao} · usado {l.usos}x · origem: {l.origem}
                    </span>
                  </div>
                  <p className="text-sm font-medium">{l.titulo}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{l.conteudo}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {l.status !== "APPROVED" && (
                      <Button size="sm" onClick={() => mudar(l.id, "APPROVED")}>
                        <Check className="h-4 w-4 mr-1" /> Aprovar
                      </Button>
                    )}
                    {l.status !== "REJECTED" && (
                      <Button size="sm" variant="outline" onClick={() => mudar(l.id, "REJECTED")}>
                        <X className="h-4 w-4 mr-1" /> Recusar
                      </Button>
                    )}
                    {l.status !== "ARCHIVED" && (
                      <Button size="sm" variant="ghost" onClick={() => mudar(l.id, "ARCHIVED")}>
                        <Archive className="h-4 w-4 mr-1" /> Arquivar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditando(l)}>
                      Editar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar aprendizado" : "Novo aprendizado"}</DialogTitle>
            <DialogDescription>
              Escreva como se estivesse orientando uma atendente nova. Não inclua dados de
              pacientes — CPF, telefone e e-mail são removidos automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Tipo</label>
                <Select
                  value={editando?.tipo ?? "FACT"}
                  onValueChange={(v) => setEditando((e) => ({ ...e, tipo: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Onde vale</label>
                <Select
                  value={editando?.canal ?? "todos"}
                  onValueChange={(v) => setEditando((e) => ({ ...e, canal: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os canais</SelectItem>
                    <SelectItem value="whatsapp">Somente WhatsApp</SelectItem>
                    <SelectItem value="interno">Somente chat interno</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Título</label>
              <Input
                value={editando?.titulo ?? ""}
                onChange={(e) => setEditando((x) => ({ ...x, titulo: e.target.value }))}
                placeholder="Ex.: Exame de sangue exige jejum de 8 horas"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">O que a Nina deve saber</label>
              <Textarea
                rows={6}
                value={editando?.conteudo ?? ""}
                onChange={(e) => setEditando((x) => ({ ...x, conteudo: e.target.value }))}
                placeholder="Ex.: Quando o paciente perguntar sobre coleta de sangue, avise que o jejum é de 8 horas e que a coleta é até 10h."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={gravar} disabled={salvando}>
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <ThumbsUp className="h-4 w-4 mr-1" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

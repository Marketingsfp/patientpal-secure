import { useState } from "react";
import { Building2, Pencil, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  rotuloPresencaDepartamento,
  type DadosDepartamentos,
} from "@/lib/atendimento/departamentos";

type Props = {
  dados: DadosDepartamentos;
  salvarDepartamento: (id: string | null, nome: string) => Promise<void>;
  vincularAtendente: (userId: string, departamentoId: string | null) => Promise<void>;
  demonstracao?: boolean;
  somenteLeitura?: boolean;
};

export function DepartamentosView({
  dados,
  salvarDepartamento,
  vincularAtendente,
  demonstracao,
  somenteLeitura = false,
}: Props) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  const [edicao, setEdicao] = useState<{ id: string | null; nome: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const bloqueado = salvando || somenteLeitura;
  const ativos = dados.departamentos.filter((d) => d.ativo);
  const atendentes = dados.atendentes.filter(
    (a) =>
      a.nome.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")) &&
      (!filtro || (filtro === "sem" ? !a.departamentoId : a.departamentoId === filtro)),
  );
  const executar = async (acao: () => Promise<void>) => {
    setSalvando(true);
    setErro("");
    try {
      await acao();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="space-y-6" aria-busy={salvando}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {demonstracao && (
            <Badge variant="secondary" className="mb-3">
              Prévia · dados fictícios
            </Badge>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">Departamentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize a equipe de Telefonia e o destino das transferências.
          </p>
        </div>
        <Button
          disabled={bloqueado}
          onClick={() => {
            setErro("");
            setEdicao({ id: null, nome: "" });
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Novo departamento
        </Button>
      </div>
      {erro && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {erro}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ativos.map((d) => {
          const equipe = dados.atendentes.filter((a) => a.departamentoId === d.id);
          const online = equipe.filter((a) => a.presenca === "ONLINE").length;
          return (
            <Card key={d.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <h2 className="break-words">{d.nome}</h2>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={bloqueado}
                  aria-label={`Renomear ${d.nome}`}
                  onClick={() => {
                    setErro("");
                    setEdicao({ id: d.id, nome: d.nome });
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {equipe.length}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    atendente{equipe.length === 1 ? "" : "s"}
                  </span>
                </p>
                <p
                  className={`mt-2 text-sm ${online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                >
                  {online} online
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Equipe de Telefonia
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Cada atendente fica em um departamento. A troca vale para as próximas transferências.
          </p>
          <div className="flex flex-col gap-3 pt-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Buscar atendente"
                placeholder="Buscar atendente…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              aria-label="Filtrar departamento"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todos os departamentos</option>
              <option value="sem">Sem departamento</option>
              {ativos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {atendentes.map((a) => (
              <div
                key={a.userId}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{a.nome}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full ${a.presenca === "ONLINE" ? "bg-emerald-500" : a.presenca?.startsWith("PAUSA") ? "bg-amber-500" : "bg-slate-400"}`}
                    />
                    {rotuloPresencaDepartamento(a.presenca)} · Telefonia
                  </p>
                </div>
                <select
                  aria-label={`Departamento de ${a.nome}`}
                  value={a.departamentoId ?? ""}
                  disabled={bloqueado}
                  onChange={(e) => {
                    const destino = e.target.value || null;
                    void executar(() => vincularAtendente(a.userId, destino));
                  }}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:w-64"
                >
                  <option value="">Sem departamento</option>
                  {dados.departamentos.map((d) => (
                    <option key={d.id} value={d.id} disabled={!d.ativo}>
                      {d.nome}
                      {d.ativo ? "" : " (inativo)"}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {!atendentes.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma atendente encontrada.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <p className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
        A transferência por departamento sorteia uma atendente online vinculada a ele. Sem ninguém
        online, a conversa continua com a atendente atual.
      </p>
      <Dialog
        open={edicao !== null}
        onOpenChange={(aberto) => {
          if (!aberto && !salvando) setEdicao(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edicao?.id ? "Renomear departamento" : "Novo departamento"}</DialogTitle>
            <DialogDescription>O nome identifica o destino no atendimento.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!edicao || !edicao.nome.trim() || salvando) return;
              void executar(async () => {
                await salvarDepartamento(edicao.id, edicao.nome.trim());
                setEdicao(null);
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="nome-departamento">Nome do departamento</Label>
              <Input
                id="nome-departamento"
                value={edicao?.nome ?? ""}
                onChange={(e) =>
                  setEdicao((anterior) => (anterior ? { ...anterior, nome: e.target.value } : null))
                }
                maxLength={120}
                required
                disabled={salvando}
              />
            </div>
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={salvando}
                onClick={() => setEdicao(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando || !edicao?.nome.trim()}>
                {salvando ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

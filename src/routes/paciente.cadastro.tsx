import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PortalAutenticado } from "@/components/portal-paciente/portal-shell";
import { meuCadastro, solicitarAlteracaoCadastro } from "@/lib/portal-paciente/portal.functions";
import { CAMPOS_SOLICITAVEIS } from "@/lib/portal-paciente/regras";

export const Route = createFileRoute("/paciente/cadastro")({
  component: () => <PortalAutenticado>{(c) => <Cadastro clinica={c} />}</PortalAutenticado>,
  head: () => ({
    meta: [
      { title: "Meu cadastro — Área do Paciente" },
      { name: "description", content: "Veja seus dados e peça atualização à recepção." },
      { property: "og:title", content: "Meu cadastro — Área do Paciente" },
      { property: "og:description", content: "Veja seus dados e peça atualização à recepção." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const ROTULO: Record<string, string> = {
  telefone: "Telefone (com DDD)",
  email: "E-mail",
  cep: "CEP",
  logradouro: "Rua",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "UF",
};

function Cadastro({ clinica }: { clinica: string | null }) {
  const qc = useQueryClient();
  const ler = useServerFn(meuCadastro);
  const solicitar = useServerFn(solicitarAlteracaoCadastro);
  const chave = ["portal-cadastro", clinica];
  const { data, isLoading, error } = useQuery({
    queryKey: chave,
    queryFn: () => ler({ data: { clinica } }),
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (data) setForm(Object.fromEntries(CAMPOS_SOLICITAVEIS.map((k) => [k, data.dados[k] ?? ""])));
  }, [data]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await solicitar({ data: { clinica, dados: form } });
      toast.success("Pedido enviado. A recepção vai conferir e atualizar.");
      setEditando(false);
      await qc.invalidateQueries({ queryKey: chave });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Link
        to="/paciente"
        className="mb-4 inline-flex items-center text-sm text-primary hover:underline"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Início
      </Link>
      <h1 className="text-2xl font-semibold">Meu cadastro</h1>
      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="mt-4 text-sm text-destructive">{(error as Error).message}</p>}
      {data && (
        <>
          <Card className="mt-4 space-y-1 p-4 text-sm">
            <p>
              <span className="text-muted-foreground">Nome:</span> {data.nome}
            </p>
            <p>
              <span className="text-muted-foreground">CPF:</span> {data.cpfMascarado}
            </p>
            {data.dataNascimento && (
              <p>
                <span className="text-muted-foreground">Nascimento:</span>{" "}
                {data.dataNascimento.split("-").reverse().join("/")}
              </p>
            )}
            <p className="pt-2 text-xs text-muted-foreground">
              Nome, CPF e nascimento só podem ser alterados na recepção.
            </p>
          </Card>
          {data.pendente && (
            <div className="mt-4 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
              Você tem um pedido de atualização aguardando a recepção (
              {Object.keys(data.pendente.dados_novos)
                .map((k) => ROTULO[k] ?? k)
                .join(", ")}
              ).
            </div>
          )}
          <form onSubmit={enviar} className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {CAMPOS_SOLICITAVEIS.map((k) => (
                <div
                  key={k}
                  className={
                    k === "logradouro" || k === "email" ? "col-span-2 space-y-1" : "space-y-1"
                  }
                >
                  <Label htmlFor={k}>{ROTULO[k]}</Label>
                  <Input
                    id={k}
                    disabled={!editando}
                    value={form[k] ?? ""}
                    maxLength={k === "estado" ? 2 : 200}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            {editando ? (
              <div className="flex gap-2">
                <Button type="submit" disabled={enviando}>
                  {enviando ? "Enviando…" : "Enviar para a recepção"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditando(false)}>
                  Desistir
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" onClick={() => setEditando(true)}>
                Pedir atualização
              </Button>
            )}
          </form>
        </>
      )}
    </>
  );
}

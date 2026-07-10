import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, LogOut, Save } from "lucide-react";
import { toast } from "sonner";
import { mostrarErro } from "@/lib/traduzir-erro";

export const Route = createFileRoute("/paciente/perfil")({
  component: PerfilPage,
  head: () => ({ meta: [{ title: "Perfil — Portal do Paciente" }] }),
});

interface Paciente {
  id: string;
  nome: string;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
}

function PerfilPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [pacientes, setPacientes] = useState<Paciente[]>([]);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/login", search: { redirect: "/paciente/perfil" } as never });
        return;
      }
      const e = session.user.email?.toLowerCase() ?? null;
      setEmail(e);
      if (e) {
        const { data, error } = await supabase
          .from("pacientes")
          .select("id, nome, telefone, cep, logradouro, numero, bairro, cidade, estado")
          .ilike("email", e);
        if (error) mostrarErro(error);
        else setPacientes((data ?? []) as Paciente[]);
      }
      setLoading(false);
    })();
  }, [navigate]);

  function update(idx: number, patch: Partial<Paciente>) {
    setPacientes((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  async function salvar(p: Paciente) {
    setSaving(true);
    const { error } = await supabase
      .from("pacientes")
      .update({
        telefone: p.telefone,
        cep: p.cep,
        logradouro: p.logradouro,
        numero: p.numero,
        bairro: p.bairro,
        cidade: p.cidade,
        estado: p.estado,
      })
      .eq("id", p.id);
    setSaving(false);
    if (error) mostrarErro(error);
    else toast.success("Dados atualizados");
  }

  async function sair() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" />
          </div>
          <span className="font-bold text-primary">ClinicaOS</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={sair}>
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>
        <nav className="mx-auto max-w-2xl px-4 pb-2 flex gap-2 text-sm overflow-x-auto">
          <Link to="/paciente" className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap">
            Início
          </Link>
          <Link
            to="/paciente/consultas"
            className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap"
          >
            Consultas
          </Link>
          <Link
            to="/paciente/cartoes"
            className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap"
          >
            Cartões
          </Link>
          <Link
            to="/paciente/financeiro"
            className="px-3 py-1.5 rounded-md hover:bg-muted whitespace-nowrap"
          >
            Financeiro
          </Link>
          <Link
            to="/paciente/perfil"
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground whitespace-nowrap"
          >
            Perfil
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-4 space-y-4">
        <h1 className="text-xl font-bold">Meu perfil</h1>
        {email && <p className="text-xs text-muted-foreground">{email}</p>}

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : pacientes.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Não encontramos cadastro de paciente com este e-mail.
          </Card>
        ) : (
          pacientes.map((p, idx) => (
            <Card key={p.id} className="p-4 space-y-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={p.nome} disabled />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input
                    value={p.telefone ?? ""}
                    onChange={(e) => update(idx, { telefone: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>CEP</Label>
                  <Input
                    value={p.cep ?? ""}
                    onChange={(e) => update(idx, { cep: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label>Logradouro</Label>
                  <Input
                    value={p.logradouro ?? ""}
                    onChange={(e) => update(idx, { logradouro: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Número</Label>
                  <Input
                    value={p.numero ?? ""}
                    onChange={(e) => update(idx, { numero: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Bairro</Label>
                  <Input
                    value={p.bairro ?? ""}
                    onChange={(e) => update(idx, { bairro: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cidade</Label>
                  <Input
                    value={p.cidade ?? ""}
                    onChange={(e) => update(idx, { cidade: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>UF</Label>
                  <Input
                    value={p.estado ?? ""}
                    maxLength={2}
                    onChange={(e) => update(idx, { estado: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>
              <Button onClick={() => salvar(p)} disabled={saving} className="w-full">
                <Save className="h-4 w-4 mr-1" /> {saving ? "Salvando..." : "Salvar"}
              </Button>
            </Card>
          ))
        )}
      </main>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/anamneses")({
  component: AnamnesePage,
  head: () => ({ meta: [{ title: "Anamneses — ClinicaOS" }] }),
});

interface Pergunta {
  texto: string;
}
interface Row {
  id: string;
  nome: string;
  descricao: string | null;
  perguntas: Pergunta[];
  ativo: boolean;
}
interface Form {
  nome: string;
  descricao: string;
  perguntas: Pergunta[];
  ativo: boolean;
}

function AnamnesePage() {
  return (
    <SimpleCrud<Row, Form>
      table="anamnese_modelos"
      selectColumns="id, nome, descricao, perguntas, ativo"
      title="Modelos de Anamnese"
      subtitle="Questionários enviados ao paciente para responder antes da consulta."
      icon={<ClipboardCheck className="h-6 w-6 text-primary" />}
      orderBy={{ column: "nome", ascending: true }}
      searchFields={["nome"]}
      columns={[
        {
          key: "nome",
          header: "Nome",
          render: (r) => <span className="font-medium">{r.nome}</span>,
        },
        {
          key: "qtd",
          header: "Perguntas",
          className: "w-28",
          render: (r) => (r.perguntas ?? []).length,
        },
        {
          key: "ativo",
          header: "Situação",
          className: "w-24",
          render: (r) => (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${r.ativo ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
            >
              {r.ativo ? "Ativo" : "Inativo"}
            </span>
          ),
        },
      ]}
      emptyForm={{ nome: "", descricao: "", perguntas: [], ativo: true }}
      toForm={(r) => ({
        nome: r.nome,
        descricao: r.descricao ?? "",
        perguntas: r.perguntas ?? [],
        ativo: r.ativo,
      })}
      toPayload={(f) => ({
        nome: f.nome.trim(),
        descricao: f.descricao || null,
        perguntas: f.perguntas,
        ativo: f.ativo,
      })}
      renderForm={(f, set) => (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label>Nome *</Label>
            <Input required value={f.nome} onChange={(e) => set({ ...f, nome: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Textarea
              rows={2}
              value={f.descricao}
              onChange={(e) => set({ ...f, descricao: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Perguntas</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => set({ ...f, perguntas: [...f.perguntas, { texto: "" }] })}
              >
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
            {f.perguntas.map((p, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={p.texto}
                  onChange={(e) => {
                    const np = [...f.perguntas];
                    np[i] = { texto: e.target.value };
                    set({ ...f, perguntas: np });
                  }}
                  placeholder={`Pergunta ${i + 1}`}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => set({ ...f, perguntas: f.perguntas.filter((_, j) => j !== i) })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {f.perguntas.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma pergunta. Clique em adicionar.
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.ativo} onCheckedChange={(v) => set({ ...f, ativo: !!v })} /> Ativo
          </label>
        </div>
      )}
    />
  );
}

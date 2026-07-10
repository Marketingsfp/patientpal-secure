import { createFileRoute } from "@tanstack/react-router";
import { FileHeart, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/prontuario-modelos")({
  component: ModelosPage,
  head: () => ({ meta: [{ title: "Modelos de Prontuário — ClinicaOS" }] }),
});

type Secao = { chave: string; titulo: string; placeholder?: string };
type Modelo = {
  id: string;
  nome: string;
  prompt_ia: string | null;
  ativo: boolean;
  secoes: Secao[];
};
type Form = Omit<Modelo, "id">;
const EMPTY: Form = {
  nome: "",
  prompt_ia: "",
  ativo: true,
  secoes: [{ chave: "queixa_principal", titulo: "Queixa principal", placeholder: "" }],
};

function ModelosPage() {
  return (
    <SimpleCrud<Modelo, Form>
      table="prontuario_modelos"
      selectColumns="id, nome, prompt_ia, ativo, secoes"
      title="Modelos de Prontuário"
      subtitle="Estrutura SOAP por especialidade, usada no Atendimento com IA."
      icon={<FileHeart className="h-6 w-6 text-primary" />}
      orderBy={{ column: "nome", ascending: true }}
      columns={[
        {
          key: "nome",
          header: "Modelo",
          render: (r) => <span className="font-medium">{r.nome}</span>,
        },
        {
          key: "secoes",
          header: "Seções",
          render: (r) => (
            <span className="text-sm text-muted-foreground">{r.secoes?.length ?? 0} campos</span>
          ),
        },
        { key: "ativo", header: "Ativo", render: (r) => (r.ativo ? "Sim" : "Não") },
      ]}
      emptyForm={EMPTY}
      toForm={(r) => ({
        nome: r.nome,
        prompt_ia: r.prompt_ia ?? "",
        ativo: r.ativo,
        secoes: r.secoes ?? [],
      })}
      toPayload={(f) => ({
        nome: f.nome,
        prompt_ia: f.prompt_ia || null,
        ativo: f.ativo,
        secoes: f.secoes,
      })}
      renderForm={(f, set) => (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label>Nome do modelo / Especialidade *</Label>
            <Input
              value={f.nome}
              onChange={(e) => set({ ...f, nome: e.target.value })}
              placeholder="Ex: Cardiologia"
            />
          </div>
          <div className="space-y-1">
            <Label>Instrução extra para a IA (opcional)</Label>
            <Textarea
              rows={3}
              value={f.prompt_ia ?? ""}
              onChange={(e) => set({ ...f, prompt_ia: e.target.value })}
              placeholder="Ex: Você é cardiologista. Documente PA, FC, ausculta, fatores de risco CV."
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Seções do prontuário</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  set({
                    ...f,
                    secoes: [
                      ...f.secoes,
                      {
                        chave: `campo_${f.secoes.length + 1}`,
                        titulo: "Novo campo",
                        placeholder: "",
                      },
                    ],
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
            {f.secoes.map((s, i) => (
<<<<<<< HEAD
              <div
                key={i}
                className="grid grid-cols-12 gap-2 items-end p-2 rounded border bg-muted/20"
              >
                <div className="col-span-3 space-y-1">
=======
              <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 rounded border bg-muted/20">
                <div className="col-span-12 sm:col-span-3 space-y-1">
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
                  <Label className="text-xs">Chave</Label>
                  <Input
                    value={s.chave}
                    onChange={(e) => {
                      const ns = [...f.secoes];
                      ns[i] = { ...s, chave: e.target.value };
                      set({ ...f, secoes: ns });
                    }}
                  />
                </div>
                <div className="col-span-12 sm:col-span-4 space-y-1">
                  <Label className="text-xs">Título</Label>
                  <Input
                    value={s.titulo}
                    onChange={(e) => {
                      const ns = [...f.secoes];
                      ns[i] = { ...s, titulo: e.target.value };
                      set({ ...f, secoes: ns });
                    }}
                  />
                </div>
                <div className="col-span-10 sm:col-span-4 space-y-1">
                  <Label className="text-xs">Placeholder</Label>
                  <Input
                    value={s.placeholder ?? ""}
                    onChange={(e) => {
                      const ns = [...f.secoes];
                      ns[i] = { ...s, placeholder: e.target.value };
                      set({ ...f, secoes: ns });
                    }}
                  />
                </div>
<<<<<<< HEAD
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="col-span-1"
                  onClick={() => {
                    const ns = f.secoes.filter((_, idx) => idx !== i);
                    set({ ...f, secoes: ns });
                  }}
                >
=======
                <Button type="button" size="icon" variant="ghost" className="col-span-2 sm:col-span-1" onClick={() => { const ns = f.secoes.filter((_, idx) => idx !== i); set({ ...f, secoes: ns }); }}>
>>>>>>> 18eb686dbc25b258ff35f41366dbb0c3660f374b
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    />
  );
}

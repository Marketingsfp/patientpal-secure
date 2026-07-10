import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { SimpleCrud } from "@/components/simple-crud/SimpleCrud";

export const Route = createFileRoute("/_authenticated/app/modelos-documentos")({
  component: ModelosDocPage,
  head: () => ({ meta: [{ title: "Modelos de Documentos — ClinicaOS" }] }),
});

type Tipo = "atestado" | "receita" | "laudo" | "declaracao" | "contrato" | "outro";
const TIPO_LABEL: Record<Tipo, string> = {
  atestado: "Atestado",
  receita: "Receita",
  laudo: "Laudo",
  declaracao: "Declaração",
  contrato: "Contrato",
  outro: "Outro",
};
interface Row {
  id: string;
  nome: string;
  tipo: Tipo;
  conteudo: string;
  ativo: boolean;
}
interface Form {
  nome: string;
  tipo: Tipo;
  conteudo: string;
  ativo: boolean;
}

function ModelosDocPage() {
  return (
    <SimpleCrud<Row, Form>
      table="modelos_documentos"
      selectColumns="id, nome, tipo, conteudo, ativo"
      title="Modelos de Documentos"
      subtitle="Padronize atestados, receitas, laudos e contratos. Use {{paciente}}, {{medico}} e {{data}} como variáveis."
      icon={<FileText className="h-6 w-6 text-primary" />}
      orderBy={{ column: "nome", ascending: true }}
      searchFields={["nome"]}
      columns={[
        {
          key: "nome",
          header: "Nome",
          render: (r) => <span className="font-medium">{r.nome}</span>,
        },
        {
          key: "tipo",
          header: "Tipo",
          className: "w-32",
          render: (r) => (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {TIPO_LABEL[r.tipo]}
            </span>
          ),
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
      emptyForm={{ nome: "", tipo: "outro", conteudo: "", ativo: true }}
      toForm={(r) => ({ nome: r.nome, tipo: r.tipo, conteudo: r.conteudo, ativo: r.ativo })}
      toPayload={(f) => ({
        nome: f.nome.trim(),
        tipo: f.tipo,
        conteudo: f.conteudo,
        ativo: f.ativo,
      })}
      renderForm={(f, set) => (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>Nome *</Label>
              <Input
                required
                value={f.nome}
                onChange={(e) => set({ ...f, nome: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={f.tipo} onValueChange={(v) => set({ ...f, tipo: v as Tipo })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Conteúdo *</Label>
            <Textarea
              rows={10}
              required
              value={f.conteudo}
              onChange={(e) => set({ ...f, conteudo: e.target.value })}
              placeholder="Olá {{paciente}}, atesto que..."
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.ativo} onCheckedChange={(v) => set({ ...f, ativo: !!v })} /> Ativo
          </label>
        </div>
      )}
    />
  );
}

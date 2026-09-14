import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PlanoCarga } from "@/lib/nina/carga-planejamento";

export function CargaPlano({
  plano,
  onChange,
  disabled = false,
}: {
  plano: PlanoCarga;
  onChange: (p: PlanoCarga) => void;
  disabled?: boolean;
}) {
  const editar = (id: string, patch: Partial<PlanoCarga["cenarios"][number]>) =>
    onChange({
      ...plano,
      cenarios: plano.cenarios.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  return (
    <fieldset disabled={disabled} className="space-y-4 rounded-lg border p-4">
      <legend className="px-2 text-sm font-medium">
        Plano para revisão <Badge variant="secondary">Sol</Badge>
      </legend>
      <div className="space-y-1.5">
        <Label htmlFor="carga-resumo">Resumo do teste</Label>
        <Textarea
          id="carga-resumo"
          rows={2}
          value={plano.resumo}
          onChange={(e) => onChange({ ...plano, resumo: e.target.value })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Revise os cenários e as mensagens antes de disparar. As verificações abaixo são critérios
        planejados, ainda não são resultados do atendimento.
      </p>
      <p className="text-xs text-muted-foreground">
        Sol organiza o roteiro. Ao disparar, Luna prepara a redação do paciente seguindo estas
        etapas, na mesma ordem e quantidade. As mensagens não se adaptam durante a conversa; Nina
        responde com o modelo configurado no atendimento.
      </p>
      {plano.alertas.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {plano.alertas.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      {plano.cenarios.map((c, i) => (
        <div key={c.id} className="space-y-3 rounded-md border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Cenário {i + 1}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled || plano.cenarios.length <= 1}
              aria-label={`Remover cenário ${i + 1}`}
              onClick={() =>
                onChange({ ...plano, cenarios: plano.cenarios.filter((x) => x.id !== c.id) })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`carga-titulo-${c.id}`}>Título</Label>
            <Input
              id={`carga-titulo-${c.id}`}
              value={c.titulo}
              maxLength={120}
              onChange={(e) => editar(c.id, { titulo: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`carga-objetivo-${c.id}`}>O que este cenário deve testar</Label>
            <Textarea
              id={`carga-objetivo-${c.id}`}
              rows={2}
              value={c.objetivo}
              onChange={(e) => editar(c.id, { objetivo: e.target.value })}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`carga-mensagens-${c.id}`}>
                Roteiro das mensagens do paciente, na ordem (uma por linha)
              </Label>
              <Textarea
                id={`carga-mensagens-${c.id}`}
                rows={5}
                value={c.mensagens.join("\n")}
                onChange={(e) => editar(c.id, { mensagens: e.target.value.split("\n") })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`carga-verificacoes-${c.id}`}>
                Verificações planejadas (uma por linha)
              </Label>
              <Textarea
                id={`carga-verificacoes-${c.id}`}
                rows={5}
                value={c.verificacoes.join("\n")}
                onChange={(e) => editar(c.id, { verificacoes: e.target.value.split("\n") })}
              />
            </div>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || plano.cenarios.length >= 10}
        onClick={() =>
          onChange({
            ...plano,
            cenarios: [
              ...plano.cenarios,
              {
                id: `cenario-${crypto.randomUUID()}`,
                titulo: "Novo cenário",
                objetivo: "",
                mensagens: [""],
                verificacoes: [""],
              },
            ],
          })
        }
      >
        <Plus className="mr-2 h-4 w-4" /> Adicionar cenário
      </Button>
    </fieldset>
  );
}

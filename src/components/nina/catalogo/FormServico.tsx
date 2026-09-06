import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Lock, Plus, Trash2 } from "lucide-react";
import { formatarBRL, servicoSchema, valorResumo, paraNumero } from "@/lib/nina/catalogo";
import {
  FormasPagamentoEditor,
  type LinhaPagamento,
} from "./FormasPagamentoEditor";

export type OpcoesCatalogo = {
  procedimentos: Array<{ id: string; nome: string; tipo?: string | null; preparo?: string | null }>;
  medicos: Array<{ id: string; nome: string }>;
  especialidades: Array<{ id: string; nome: string }>;
  unidades: Array<{ id: string; nome: string }>;
  convenios: Array<{ id: string; nome: string }>;
};

type Executante = { medico_id: string | null; nome: string; horarios: string };

export type EstadoServico = {
  id: string | null;
  procedimento_id: string | null;
  nome: string;
  valor: string;
  valor_observacao: string;
  descricao_publica: string;
  preparo: string;
  restricoes: string;
  nota_interna: string;
  executantes: Executante[];
  formas_pagamento: LinhaPagamento[];
};

export const servicoVazio = (): EstadoServico => ({
  id: null,
  procedimento_id: null,
  nome: "",
  valor: "",
  valor_observacao: "",
  descricao_publica: "",
  preparo: "",
  restricoes: "",
  nota_interna: "",
  executantes: [],
  formas_pagamento: [],
});

export function servicoDoRegistro(r: any): EstadoServico {
  const fonte = { ...r, ...(r?.rascunho ?? {}) };
  return {
    id: r.id,
    procedimento_id: fonte.procedimento_id ?? null,
    nome: fonte.nome ?? "",
    valor: fonte.valor === null || fonte.valor === undefined ? "" : String(fonte.valor),
    valor_observacao: fonte.valor_observacao ?? "",
    descricao_publica: fonte.descricao_publica ?? "",
    preparo: fonte.preparo ?? "",
    restricoes: fonte.restricoes ?? "",
    nota_interna: fonte.nota_interna ?? "",
    executantes: (fonte.executantes ?? []).map((e: any) => ({
      medico_id: e?.medico_id ?? null,
      nome: e?.nome ?? "",
      horarios: e?.horarios ?? "",
    })),
    formas_pagamento: (fonte.formas_pagamento ?? []).map((f: any) => ({
      forma: f?.forma ?? "",
      valor: f?.valor === null || f?.valor === undefined ? "" : String(f.valor),
      condicao: f?.condicao ?? "",
      observacao: f?.observacao ?? "",
    })),
  };
}

/** Converte o estado da tela no formato validado enviado ao servidor. */
export function servicoParaEnvio(e: EstadoServico) {
  return servicoSchema.parse({
    procedimento_id: e.procedimento_id,
    nome: e.nome,
    valor: e.valor,
    valor_observacao: e.valor_observacao,
    descricao_publica: e.descricao_publica,
    preparo: e.preparo,
    restricoes: e.restricoes,
    nota_interna: e.nota_interna,
    executantes: e.executantes
      .filter((x) => x.nome.trim())
      .map((x) => ({ medico_id: x.medico_id, nome: x.nome, horarios: x.horarios })),
    formas_pagamento: e.formas_pagamento
      .filter((f) => f.forma.trim())
      .map((f) => ({
        forma: f.forma,
        valor: f.valor,
        condicao: f.condicao,
        observacao: f.observacao,
      })),
  });
}

export function FormServico({
  estado,
  onChange,
  opcoes,
  somenteLeitura,
}: {
  estado: EstadoServico;
  onChange: (e: EstadoServico) => void;
  opcoes: OpcoesCatalogo;
  somenteLeitura?: boolean;
}) {
  const [abertos, setAbertos] = useState<string[]>(["pagamento"]);
  const set = (patch: Partial<EstadoServico>) => onChange({ ...estado, ...patch });

  const formasComValor = estado.formas_pagamento.some((f) => paraNumero(f.valor) !== null);
  const resumo = valorResumo({
    valor: paraNumero(estado.valor),
    formas_pagamento: estado.formas_pagamento.map((f) => ({ valor: paraNumero(f.valor) })),
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Procedimento *</Label>
          <Input
            value={estado.nome}
            disabled={somenteLeitura}
            placeholder="Ex.: Ultrassonografia de tireoide"
            onChange={(e) => set({ nome: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Vincular ao cadastro do sistema</Label>
          <SearchableSelect
            options={opcoes.procedimentos.map((p) => ({ value: p.id, label: p.nome }))}
            value={estado.procedimento_id ?? ""}
            disabled={somenteLeitura}
            placeholder="Opcional — usa o procedimento já cadastrado"
            onChange={(v) => {
              const p = opcoes.procedimentos.find((x) => x.id === v);
              set({ procedimento_id: v || null, nome: estado.nome || (p?.nome ?? "") });
            }}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="flex items-center gap-2">
            Valor
            {formasComValor && <Lock className="h-3 w-3 text-muted-foreground" />}
          </Label>
          <CurrencyInput
            value={formasComValor ? String(resumo ?? "") : estado.valor}
            disabled={somenteLeitura || formasComValor}
            placeholder="Não informado"
            onChange={(v) => set({ valor: v })}
          />
          <p className="text-xs text-muted-foreground">
            {formasComValor
              ? `Calculado a partir das formas de pagamento: ${formatarBRL(resumo)}.`
              : "Em branco significa valor não informado, não gratuito."}
          </p>
        </div>
        <div className="space-y-1">
          <Label>Observação do valor</Label>
          <Input
            value={estado.valor_observacao}
            disabled={somenteLeitura}
            placeholder="Ex.: valor por sessão"
            onChange={(e) => set({ valor_observacao: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Descrição pública</Label>
        <Textarea
          rows={3}
          value={estado.descricao_publica}
          disabled={somenteLeitura}
          placeholder="Explicação que a Nina pode passar ao paciente"
          onChange={(e) => set({ descricao_publica: e.target.value })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Preparo do exame</Label>
          <Textarea
            rows={3}
            value={estado.preparo}
            disabled={somenteLeitura}
            placeholder="Ex.: jejum de 4 horas"
            onChange={(e) => set({ preparo: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Restrições e requisitos</Label>
          <Textarea
            rows={3}
            value={estado.restricoes}
            disabled={somenteLeitura}
            placeholder="Ex.: necessário pedido médico"
            onChange={(e) => set({ restricoes: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Nota interna (somente equipe)</Label>
        <Textarea
          rows={2}
          value={estado.nota_interna}
          disabled={somenteLeitura}
          placeholder="Uso interno — não é fornecido à Nina nem ao paciente"
          onChange={(e) => set({ nota_interna: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Visível apenas para a equipe. Não entra no conteúdo enviado à Nina.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Quem realiza / horários</Label>
        {estado.executantes.map((ex, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <SearchableSelect
              options={opcoes.medicos.map((m) => ({ value: m.id, label: m.nome }))}
              value={ex.medico_id ?? ""}
              disabled={somenteLeitura}
              placeholder="Profissional cadastrado (opcional)"
              onChange={(v) => {
                const m = opcoes.medicos.find((x) => x.id === v);
                set({
                  executantes: estado.executantes.map((x, idx) =>
                    idx === i ? { ...x, medico_id: v || null, nome: m?.nome ?? x.nome } : x,
                  ),
                });
              }}
            />
            <Input
              value={ex.horarios}
              disabled={somenteLeitura}
              placeholder="Ex.: Seg e Qua, 08:00–12:00"
              onChange={(e) =>
                set({
                  executantes: estado.executantes.map((x, idx) =>
                    idx === i ? { ...x, horarios: e.target.value } : x,
                  ),
                })
              }
            />
            {!somenteLeitura && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  set({ executantes: estado.executantes.filter((_, idx) => idx !== i) })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {estado.executantes.some((x) => !x.nome.trim()) && (
          <p className="text-xs text-amber-600">
            Escolha o profissional ou digite o nome para que a linha seja salva.
          </p>
        )}
        {!somenteLeitura && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              set({
                executantes: [
                  ...estado.executantes,
                  { medico_id: null, nome: "", horarios: "" },
                ],
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Adicionar quem realiza
          </Button>
        )}
      </div>

      <Accordion type="multiple" value={abertos} onValueChange={setAbertos}>
        <AccordionItem value="pagamento">
          <AccordionTrigger>Formas de pagamento e condições</AccordionTrigger>
          <AccordionContent>
            <FormasPagamentoEditor
              linhas={estado.formas_pagamento}
              somenteLeitura={somenteLeitura}
              onChange={(l) => set({ formas_pagamento: l })}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

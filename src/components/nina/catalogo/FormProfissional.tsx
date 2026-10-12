import {
  CamposOrganizacao,
  CampoEncaminhamentoHumano,
  CampoNinaPodeAgendar,
  CampoSituacaoConvenios,
  ComplementosAtendimentos,
  EstruturaCatalogoEditor,
} from "./EstruturaCatalogoEditor";
import { RotuloAjuda, SecaoCatalogo } from "./AjudaCatalogo";
import { useCatalogoOrganizado } from "./catalogo-organizado";
import { PedidoMedicoEditor } from "./PedidoMedicoEditor";
import {
  estruturaVazia,
  lerEstrutura,
  type EstruturaCatalogo,
} from "@/lib/nina/catalogo-estrutura";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextoCatalogo as Textarea, CampoTextoCatalogo } from "./TextoCatalogo";
import { DateInputBR } from "@/components/ui/date-input-br";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, Trash2 } from "lucide-react";
import { DIAS_SEMANA, RECORRENCIAS, profissionalSchema } from "@/lib/nina/catalogo";
import { MODALIDADES_ATENDIMENTO, interpretarModalidade } from "@/lib/nina/modalidade-atendimento";
import { FormasPagamentoEditor, type LinhaPagamento } from "./FormasPagamentoEditor";
import type { OpcoesCatalogo } from "./FormServico";

type LinhaHorario = {
  tipo_escala?: "consulta" | "exame_procedimento";
  dia: string;
  inicio: string;
  fim: string;
  recorrencia: string;
  observacao: string;
};

export type EstadoProfissional = {
  estrutura: EstruturaCatalogo;
  id: string | null;
  medico_id: string | null;
  unidade_id: string | null;
  nome: string;
  especialidades: string[];
  especialidadesLivres: string[];
  atende_consultorio: "sim" | "nao" | "";
  formas_pagamento: LinhaPagamento[];
  convenios: string[];
  horarios: LinhaHorario[];
  tipo_atendimento: string;
  observacao_publica: string;
  aviso_dia: string;
  aviso_valido_de: string;
  aviso_valido_ate: string;
  nota_interna: string;
};

export const profissionalVazio = (): EstadoProfissional => ({
  estrutura: estruturaVazia(),
  id: null,
  medico_id: null,
  unidade_id: null,
  nome: "",
  especialidades: [],
  especialidadesLivres: [],
  atende_consultorio: "",
  formas_pagamento: [],
  convenios: [],
  horarios: [],
  tipo_atendimento: "",
  observacao_publica: "",
  aviso_dia: "",
  aviso_valido_de: "",
  aviso_valido_ate: "",
  nota_interna: "",
});

export function profissionalDoRegistro(r: any): EstadoProfissional {
  const f = { ...r, ...(r?.rascunho ?? {}) };
  const esp = (f.especialidades ?? []) as Array<{ id?: string | null; nome?: string }>;
  const conv = (f.convenios ?? []) as Array<{ id?: string | null; nome?: string }>;
  return {
    estrutura: lerEstrutura(f.estrutura),
    id: r.id,
    medico_id: f.medico_id ?? null,
    unidade_id: f.unidade_id ?? null,
    nome: f.nome ?? "",
    especialidades: esp.filter((e) => e?.id).map((e) => String(e.id)),
    especialidadesLivres: esp.filter((e) => !e?.id && e?.nome).map((e) => String(e.nome)),
    atende_consultorio:
      f.atende_consultorio === true ? "sim" : f.atende_consultorio === false ? "nao" : "",
    formas_pagamento: (f.formas_pagamento ?? []).map((p: any) => ({
      forma: p?.forma ?? "",
      valor: p?.valor === null || p?.valor === undefined ? "" : String(p.valor),
      condicao: p?.condicao ?? "",
      observacao: p?.observacao ?? "",
    })),
    convenios: conv.filter((c) => c?.id).map((c) => String(c.id)),
    horarios: (f.horarios ?? []).map((h: any) => ({
      ...(h?.tipo_escala ? { tipo_escala: h.tipo_escala } : {}),
      dia: h?.dia ?? DIAS_SEMANA[0],
      inicio: h?.inicio ?? "",
      fim: h?.fim ?? "",
      recorrencia: h?.recorrencia ?? "Toda semana",
      observacao: h?.observacao ?? "",
    })),
    tipo_atendimento: f.tipo_atendimento ?? "",
    observacao_publica: f.observacao_publica ?? "",
    aviso_dia: f.aviso_dia ?? "",
    aviso_valido_de: f.aviso_valido_de ?? "",
    aviso_valido_ate: f.aviso_valido_ate ?? "",
    nota_interna: f.nota_interna ?? "",
  };
}

export function profissionalParaEnvio(e: EstadoProfissional, opcoes: OpcoesCatalogo) {
  const nomeDe = (lista: Array<{ id: string; nome: string }>, id: string) =>
    lista.find((x) => x.id === id)?.nome ?? id;
  return profissionalSchema.parse({
    estrutura: {
      ...e.estrutura,
      aliases: e.estrutura.aliases.map((s) => s.trim()).filter(Boolean),
    },
    medico_id: e.medico_id,
    unidade_id: e.unidade_id,
    nome: e.nome,
    especialidades: [
      ...e.especialidades.map((id) => ({ id, nome: nomeDe(opcoes.especialidades, id) })),
      ...e.especialidadesLivres.map((nome) => ({ id: null, nome })),
    ],
    atende_consultorio:
      e.atende_consultorio === "sim" ? true : e.atende_consultorio === "nao" ? false : null,
    formas_pagamento: e.formas_pagamento.filter((p) => p.forma.trim()),
    convenios: e.convenios.map((id) => ({ id, nome: nomeDe(opcoes.convenios, id) })),
    horarios: e.horarios,
    tipo_atendimento: e.tipo_atendimento,
    observacao_publica: e.observacao_publica,
    aviso_dia: e.aviso_dia,
    aviso_valido_de: e.aviso_valido_de,
    aviso_valido_ate: e.aviso_valido_ate,
    nota_interna: e.nota_interna,
  });
}

/** Como a Nina interpreta uma modalidade antiga, fora da lista confirmada. */
function rotuloModalidadeLegada(valor: string): string {
  const m = interpretarModalidade(valor);
  return m && m !== "nao_definida"
    ? `Cadastro atual: ${valor} — a Nina trata como “${MODALIDADES_ATENDIMENTO[m]}”`
    : `Cadastro atual: ${valor} — a Nina trata como sem modalidade`;
}

export function FormProfissional({
  estado,
  onChange,
  opcoes,
  somenteLeitura,
}: {
  estado: EstadoProfissional;
  onChange: (e: EstadoProfissional) => void;
  opcoes: OpcoesCatalogo;
  somenteLeitura?: boolean;
}) {
  const organizado = useCatalogoOrganizado();
  const set = (patch: Partial<EstadoProfissional>) => onChange({ ...estado, ...patch });
  const setHorario = (i: number, patch: Partial<LinhaHorario>) =>
    set({ horarios: estado.horarios.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) });

  const estrutura = {
    valor: estado.estrutura,
    onChange: (e: EstruturaCatalogo) => set({ estrutura: e }),
    somenteLeitura,
  };
  const atendimentos = {
    ...estrutura,
    conteudo: estado.observacao_publica,
    profissional: estado.nome,
    atendimento: "Consulta",
    onOrganizar: (observacao_publica: string) => set({ observacao_publica }),
  };

  const pedidoMedico = (
    <PedidoMedicoEditor
      valor={estado.estrutura.pedido_medico}
      somenteLeitura={somenteLeitura}
      onChange={(pedido_medico) => set({ estrutura: { ...estado.estrutura, pedido_medico } })}
    />
  );
  const nome = (
    <div className="space-y-1">
      <RotuloAjuda chave="nome_profissional">Nome do profissional *</RotuloAjuda>
      <CampoTextoCatalogo
        value={estado.nome}
        disabled={somenteLeitura}
        onChange={(e) => set({ nome: e.target.value })}
      />
    </div>
  );
  const vinculo = (
    <div className="space-y-1">
      <RotuloAjuda chave="vinculo_medico">Vincular ao cadastro do sistema</RotuloAjuda>
      <SearchableSelect
        options={opcoes.medicos.map((m) => ({ value: m.id, label: m.nome }))}
        value={estado.medico_id ?? ""}
        disabled={somenteLeitura}
        placeholder="Opcional"
        onChange={(v) => {
          const m = opcoes.medicos.find((x) => x.id === v);
          set({ medico_id: v || null, nome: estado.nome || (m?.nome ?? "") });
        }}
      />
      <p className="text-xs text-muted-foreground">
        Para copiar os dados da origem, use “Sincronizar com Clínica OS” na lista. O vínculo não
        atualiza os campos sozinho.
      </p>
    </div>
  );
  const especialidades = (
    <div className="space-y-1">
      <RotuloAjuda chave="especialidades">Especialidades</RotuloAjuda>
      <SearchableMultiSelect
        options={opcoes.especialidades.map((e) => ({ value: e.id, label: e.nome }))}
        value={estado.especialidades}
        disabled={somenteLeitura}
        placeholder="Selecione uma ou mais"
        onChange={(v) => set({ especialidades: v })}
      />
    </div>
  );
  const unidade = (
    <div className="space-y-1">
      <RotuloAjuda chave="unidade">Unidade</RotuloAjuda>
      <SearchableSelect
        options={opcoes.unidades.map((u) => ({ value: u.id, label: u.nome }))}
        value={estado.unidade_id ?? ""}
        disabled={somenteLeitura}
        placeholder="Opcional"
        onChange={(v) => set({ unidade_id: v || null })}
      />
    </div>
  );
  const atendeConsultorio = (
    <div className="space-y-1">
      <RotuloAjuda chave="atende_consultorio">Atende no consultório</RotuloAjuda>
      <Select
        value={estado.atende_consultorio || "nao_informado"}
        disabled={somenteLeitura}
        onValueChange={(v) =>
          set({
            atende_consultorio:
              v === "nao_informado" ? "" : (v as EstadoProfissional["atende_consultorio"]),
          })
        }
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="nao_informado">Não informado</SelectItem>
          <SelectItem value="sim">Sim</SelectItem>
          <SelectItem value="nao">Não</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
  const modalidade = (
    <div className="space-y-1">
      <RotuloAjuda chave="modalidade_profissional" htmlFor="modalidade-profissional">
        Modalidade de atendimento
      </RotuloAjuda>
      <select
        id="modalidade-profissional"
        aria-label="Modalidade de atendimento"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={estado.tipo_atendimento}
        disabled={somenteLeitura}
        onChange={(e) => set({ tipo_atendimento: e.target.value })}
      >
        <option value="">Não informado</option>
        {!Object.values(MODALIDADES_ATENDIMENTO).includes(estado.tipo_atendimento as never) &&
          estado.tipo_atendimento && (
            <option value={estado.tipo_atendimento}>
              {rotuloModalidadeLegada(estado.tipo_atendimento)}
            </option>
          )}
        {Object.values(MODALIDADES_ATENDIMENTO).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        Define como a Nina conduz a consulta quando o atendimento não tem modalidade própria. Sem
        modalidade, a Nina informa e encaminha à equipe.
      </p>
    </div>
  );
  const convenios = (
    <div className="space-y-1">
      <RotuloAjuda chave="convenios">Convênios que atende</RotuloAjuda>
      <SearchableMultiSelect
        options={opcoes.convenios.map((c) => ({ value: c.id, label: c.nome }))}
        value={estado.convenios}
        disabled={somenteLeitura}
        placeholder="Selecione os convênios"
        onChange={(v) => set({ convenios: v })}
      />
    </div>
  );
  const horarios = (
    <div className="space-y-2">
      <RotuloAjuda chave="horarios_profissional">Horários por dia da semana</RotuloAjuda>
      {estado.horarios.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum horário informado. Dia sem cadastro não significa dia fechado.
        </p>
      )}
      {estado.horarios.map((h, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-4">
            <Select
              value={h.dia}
              disabled={somenteLeitura}
              onValueChange={(v) => setHorario(i, { dia: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Dia" />
              </SelectTrigger>
              <SelectContent>
                {DIAS_SEMANA.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="Início do atendimento"
              type="time"
              value={h.inicio}
              disabled={somenteLeitura}
              onChange={(e) => setHorario(i, { inicio: e.target.value })}
            />
            <Input
              aria-label="Fim do atendimento (não é limite de chegada)"
              type="time"
              value={h.fim}
              disabled={somenteLeitura}
              onChange={(e) => setHorario(i, { fim: e.target.value })}
            />
            <Select
              value={h.recorrencia}
              disabled={somenteLeitura}
              onValueChange={(v) => setHorario(i, { recorrencia: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Recorrência" />
              </SelectTrigger>
              <SelectContent>
                {RECORRENCIAS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <CampoTextoCatalogo
              value={h.observacao}
              disabled={somenteLeitura}
              placeholder="Observação do horário (opcional)"
              onChange={(e) => setHorario(i, { observacao: e.target.value })}
            />
            {!somenteLeitura && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => set({ horarios: estado.horarios.filter((_, idx) => idx !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
      {!somenteLeitura && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            set({
              horarios: [
                ...estado.horarios,
                {
                  dia: DIAS_SEMANA[0],
                  inicio: "",
                  fim: "",
                  recorrencia: "Toda semana",
                  observacao: "",
                },
              ],
            })
          }
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar horário
        </Button>
      )}
    </div>
  );
  const observacaoPublica = (
    <div className="space-y-1">
      <RotuloAjuda chave="observacao_publica">Informações públicas dos atendimentos</RotuloAjuda>
      <Textarea
        rows={2}
        value={estado.observacao_publica}
        disabled={somenteLeitura}
        onChange={(e) => set({ observacao_publica: e.target.value })}
      />
    </div>
  );
  const avisoSemDatas =
    estado.aviso_dia.trim() !== "" && !estado.aviso_valido_de && !estado.aviso_valido_ate;
  const aviso = (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="space-y-1">
        <RotuloAjuda chave="aviso_dia">Aviso do dia</RotuloAjuda>
        <Textarea
          rows={2}
          value={estado.aviso_dia}
          disabled={somenteLeitura}
          placeholder="Ex.: hoje o atendimento começa às 10:00"
          onChange={(e) => set({ aviso_dia: e.target.value })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Válido de</Label>
          <DateInputBR
            value={estado.aviso_valido_de}
            disabled={somenteLeitura}
            onChange={(e) => set({ aviso_valido_de: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Válido até</Label>
          <DateInputBR
            value={estado.aviso_valido_ate}
            disabled={somenteLeitura}
            onChange={(e) => set({ aviso_valido_ate: e.target.value })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A Nina só informa o aviso dentro do período. Sem datas, ele vale até ser apagado.
      </p>
      {avisoSemDatas && (
        <p className="text-xs text-amber-600">
          Este aviso não tem datas: a Nina vai informá-lo até que ele seja apagado.
        </p>
      )}
    </div>
  );
  const formasPagamento = (
    <FormasPagamentoEditor
      linhas={estado.formas_pagamento}
      somenteLeitura={somenteLeitura}
      onChange={(l) => set({ formas_pagamento: l })}
    />
  );
  const notaInterna = (
    <div className="space-y-1">
      <RotuloAjuda chave="nota_interna">Nota interna (somente equipe)</RotuloAjuda>
      <Textarea
        rows={6}
        value={estado.nota_interna}
        disabled={somenteLeitura}
        onChange={(e) => set({ nota_interna: e.target.value })}
      />
      <p className="text-xs text-muted-foreground">
        Visível apenas para a equipe. Não entra no conteúdo enviado à Nina.
      </p>
    </div>
  );

  if (organizado)
    return (
      <div className="space-y-4">
        <SecaoCatalogo titulo="Identificação">
          <div className="grid gap-3 sm:grid-cols-2">
            {nome}
            {vinculo}
            {especialidades}
            {unidade}
          </div>
        </SecaoCatalogo>
        <SecaoCatalogo
          titulo="Regras da Nina"
          descricao="Decidem se a Nina agenda, encaminha ou pede documentos para este profissional."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {modalidade}
            <CampoNinaPodeAgendar {...estrutura} />
            <CampoEncaminhamentoHumano {...estrutura} />
            {pedidoMedico}
          </div>
        </SecaoCatalogo>
        <SecaoCatalogo titulo="Horários">
          {horarios}
          {aviso}
        </SecaoCatalogo>
        <SecaoCatalogo titulo="Convênios e consultório">
          {convenios}
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoSituacaoConvenios {...estrutura} />
            {atendeConsultorio}
          </div>
        </SecaoCatalogo>
        <SecaoCatalogo titulo="Valores">{formasPagamento}</SecaoCatalogo>
        <SecaoCatalogo
          titulo="Texto para o paciente e atendimentos"
          descricao="A modalidade de cada atendimento fica aqui e tem prioridade sobre a do profissional."
        >
          {observacaoPublica}
          <ComplementosAtendimentos {...atendimentos} />
        </SecaoCatalogo>
        <SecaoCatalogo titulo="Organização interna" descricao="Não muda o atendimento da Nina.">
          <div className="grid gap-3 sm:grid-cols-2">
            <CamposOrganizacao {...estrutura} tipo="profissional" />
          </div>
        </SecaoCatalogo>
        <SecaoCatalogo titulo="Nota interna">{notaInterna}</SecaoCatalogo>
      </div>
    );

  return (
    <div className="space-y-4">
      <EstruturaCatalogoEditor {...atendimentos} tipo="profissional" />
      {pedidoMedico}
      <div className="grid gap-3 sm:grid-cols-2">
        {nome}
        {vinculo}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {especialidades}
        {unidade}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {atendeConsultorio}
        {modalidade}
      </div>

      {convenios}

      {horarios}

      {observacaoPublica}

      {aviso}

      <Accordion type="multiple" defaultValue={["pagamento"]}>
        <AccordionItem value="pagamento">
          <AccordionTrigger>Formas de pagamento da consulta</AccordionTrigger>
          <AccordionContent>{formasPagamento}</AccordionContent>
        </AccordionItem>
      </Accordion>

      {notaInterna}
    </div>
  );
}

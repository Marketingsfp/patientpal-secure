import {
  CamposOrganizacao,
  CampoEncaminhamentoHumano,
  CampoNinaPodeAgendar,
  CampoSituacaoPreparo,
  ComplementosAtendimentos,
  EstruturaCatalogoEditor,
} from "./EstruturaCatalogoEditor";
import { ComoLer, RotuloAjuda, SecaoCatalogo } from "./AjudaCatalogo";
import { ItemEstruturado, useCatalogoOrganizado } from "./catalogo-organizado";
import {
  AtendimentosEditor,
  AvisoItemEstruturadoClassico,
  AvisoTextoLivre,
  ConversaoParaAtendimentos,
  DesfazerConversao,
  PendenciasAtendimentos,
} from "./AtendimentosEditor";
import {
  converterParaEstruturado,
  copiaFormatoAntigo,
  restaurarFormatoAntigo,
} from "@/lib/nina/catalogo-atendimentos";
import { pendenciasEstrutura, type AtendimentoCatalogo } from "@/lib/nina/catalogo-estrutura";
import { PedidoMedicoEditor } from "./PedidoMedicoEditor";
import {
  estruturaVazia,
  lerEstrutura,
  type EstruturaCatalogo,
} from "@/lib/nina/catalogo-estrutura";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TextoCatalogo as Textarea, CampoTextoCatalogo } from "./TextoCatalogo";
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
import { FormasPagamentoEditor, type LinhaPagamento } from "./FormasPagamentoEditor";

export type OpcoesCatalogo = {
  procedimentos: Array<{ id: string; nome: string; tipo?: string | null; preparo?: string | null }>;
  medicos: Array<{ id: string; nome: string }>;
  especialidades: Array<{ id: string; nome: string }>;
  unidades: Array<{ id: string; nome: string }>;
  convenios: Array<{ id: string; nome: string }>;
};

type Executante = {
  medico_id: string | null;
  nome: string;
  horarios: string;
  observacao: string;
  tipo_escala?: "consulta" | "exame_procedimento";
};

export type EstadoServico = {
  estrutura: EstruturaCatalogo;
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
  estrutura: estruturaVazia(),
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
    estrutura: fonte.estrutura
      ? lerEstrutura(fonte.estrutura)
      : { ...estruturaVazia(), preparo_status: fonte.preparo ? "informado" : "nao_informado" },
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
      ...(e?.tipo_escala ? { tipo_escala: e.tipo_escala } : {}),
      medico_id: e?.medico_id ?? null,
      nome: e?.nome ?? "",
      horarios: e?.horarios ?? "",
      observacao: e?.observacao ?? "",
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
    estrutura: {
      ...e.estrutura,
      aliases: e.estrutura.aliases.map((s) => s.trim()).filter(Boolean),
    },
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
      .map((x) => ({
        ...(x.tipo_escala ? { tipo_escala: x.tipo_escala } : {}),
        medico_id: x.medico_id,
        nome: x.nome,
        horarios: x.horarios,
        observacao: x.observacao,
      })),
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
  somenteLeitura: somenteLeituraProp,
}: {
  estado: EstadoServico;
  onChange: (e: EstadoServico) => void;
  opcoes: OpcoesCatalogo;
  somenteLeitura?: boolean;
}) {
  const organizado = useCatalogoOrganizado();
  const [abertos, setAbertos] = useState<string[]>(["pagamento"]);
  const [pendenciasConversao, setPendenciasConversao] = useState<string[]>([]);
  const set = (patch: Partial<EstadoServico>) => onChange({ ...estado, ...patch });
  const listaAtendimentos = estado.estrutura.atendimentos ?? [];
  const estruturado = listaAtendimentos.length > 0;
  // Na tela clássica, os campos de um item estruturado são calculados: só leitura.
  const somenteLeitura = somenteLeituraProp || (!organizado && estruturado);
  const setAtendimentos = (atendimentos: AtendimentoCatalogo[]) =>
    set({ estrutura: { ...estado.estrutura, atendimentos } });
  const converter = () => {
    const antigo = {
      nome: estado.nome,
      estrutura: estado.estrutura,
      descricao_publica: estado.descricao_publica,
      valor: paraNumero(estado.valor),
      valor_observacao: estado.valor_observacao,
      executantes: estado.executantes,
      formas_pagamento: estado.formas_pagamento.map((f) => ({
        ...f,
        valor: paraNumero(f.valor),
      })),
    };
    const r = converterParaEstruturado("servico", antigo);
    setPendenciasConversao(r.pendencias);
    set({
      descricao_publica: r.descricao,
      estrutura: {
        ...estado.estrutura,
        atendimentos: r.atendimentos,
        formato_antigo: copiaFormatoAntigo("servico", antigo),
      },
    });
  };
  const desfazer = () => {
    const copia = estado.estrutura.formato_antigo;
    if (!copia) return;
    const { campos, complementos } = restaurarFormatoAntigo("servico", copia);
    const { atendimentos: _a, formato_antigo: _f, ...resto } = estado.estrutura;
    const r = servicoDoRegistro({
      ...estado,
      ...campos,
      estrutura: { ...resto, complementos },
    });
    setPendenciasConversao([]);
    set({
      descricao_publica: r.descricao_publica,
      valor: r.valor,
      valor_observacao: r.valor_observacao,
      executantes: r.executantes,
      formas_pagamento: r.formas_pagamento,
      estrutura: r.estrutura,
    });
  };

  const formasComValor = estado.formas_pagamento.some((f) => paraNumero(f.valor) !== null);
  const resumo = valorResumo({
    valor: paraNumero(estado.valor),
    formas_pagamento: estado.formas_pagamento.map((f) => ({ valor: paraNumero(f.valor) })),
  });

  const estrutura = {
    valor: estado.estrutura,
    onChange: (e: EstruturaCatalogo) => set({ estrutura: e }),
    somenteLeitura,
  };
  const atendimentos = {
    ...estrutura,
    conteudo: estado.descricao_publica,
    profissional: undefined,
    atendimento: estado.nome,
    onOrganizar: (descricao_publica: string) => set({ descricao_publica }),
  };

  const nome = (
    <div className="space-y-1">
      <RotuloAjuda chave="nome_servico">Procedimento *</RotuloAjuda>
      <CampoTextoCatalogo
        value={estado.nome}
        disabled={somenteLeitura}
        placeholder="Ex.: Ultrassonografia de tireoide"
        onChange={(e) => set({ nome: e.target.value })}
      />
    </div>
  );
  const vinculo = (
    <div className="space-y-1">
      <RotuloAjuda chave="vinculo_procedimento">Vincular ao cadastro do sistema</RotuloAjuda>
      <SearchableSelect
        options={opcoes.procedimentos.map((p) => ({ value: p.id, label: p.nome }))}
        value={estado.procedimento_id ?? ""}
        disabled={somenteLeitura}
        placeholder="Selecione o procedimento correspondente na agenda"
        onChange={(v) => {
          const p = opcoes.procedimentos.find((x) => x.id === v);
          set({ procedimento_id: v || null, nome: estado.nome || (p?.nome ?? "") });
        }}
      />
      <p className="text-xs text-muted-foreground">
        Associa este registro ao procedimento selecionado. Para copiar os dados da origem, use
        “Sincronizar com Clínica OS” na lista. O vínculo não atualiza os campos sozinho.
      </p>
    </div>
  );
  const valorReferencia = (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="flex items-center gap-2">
          Valor de referência
          {formasComValor && <Lock className="h-3 w-3 text-muted-foreground" />}
        </Label>
        <ComoLer chave="valor_referencia" />
      </div>
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
  );
  const valorObservacao = (
    <div className="space-y-1">
      <RotuloAjuda chave="valor_observacao">Observação do valor</RotuloAjuda>
      <CampoTextoCatalogo
        value={estado.valor_observacao}
        disabled={somenteLeitura}
        placeholder="Ex.: valor por sessão"
        onChange={(e) => set({ valor_observacao: e.target.value })}
      />
    </div>
  );
  const descricao = (
    <div className="space-y-1">
      <RotuloAjuda chave="descricao_publica">Descrição pública</RotuloAjuda>
      <Textarea
        rows={3}
        value={estado.descricao_publica}
        disabled={somenteLeitura}
        placeholder="Explicação que a Nina pode passar ao paciente"
        onChange={(e) => set({ descricao_publica: e.target.value })}
      />
    </div>
  );
  const preparo = (
    <div className="space-y-1">
      <RotuloAjuda chave="preparo">Preparo do exame</RotuloAjuda>
      <Textarea
        rows={3}
        value={estado.preparo}
        disabled={somenteLeitura}
        placeholder="Somente orientações confirmadas pela clínica"
        onChange={(e) => set({ preparo: e.target.value })}
      />
    </div>
  );
  const restricoes = (
    <div className="space-y-1">
      <RotuloAjuda chave="restricoes">Restrições e requisitos</RotuloAjuda>
      <Textarea
        rows={3}
        value={estado.restricoes}
        disabled={somenteLeitura}
        placeholder="Ex.: necessário pedido médico"
        onChange={(e) => set({ restricoes: e.target.value })}
      />
    </div>
  );
  const pedidoMedico = (
    <PedidoMedicoEditor
      valor={estado.estrutura.pedido_medico}
      somenteLeitura={somenteLeitura}
      onChange={(pedido_medico) => set({ estrutura: { ...estado.estrutura, pedido_medico } })}
    />
  );
  const notaInterna = (
    <div className="space-y-1">
      <RotuloAjuda chave="nota_interna">Nota interna (somente equipe)</RotuloAjuda>
      <Textarea
        rows={6}
        value={estado.nota_interna}
        disabled={somenteLeitura}
        placeholder="Uso interno — não é fornecido à Nina nem ao paciente"
        onChange={(e) => set({ nota_interna: e.target.value })}
      />
      <p className="text-xs text-muted-foreground">
        Visível apenas para a equipe. Não entra no conteúdo enviado à Nina.
      </p>
    </div>
  );
  const executantes = (
    <div className="space-y-2">
      <RotuloAjuda chave="executantes">Quem realiza / horários</RotuloAjuda>
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
          <CampoTextoCatalogo
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
              onClick={() => set({ executantes: estado.executantes.filter((_, idx) => idx !== i) })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      {estado.executantes.some((x) => !x.nome.trim()) && (
        <p className="text-xs text-amber-600">
          Escolha o profissional para que a linha seja salva. Linhas sem profissional são
          descartadas ao salvar.
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
                { medico_id: null, nome: "", horarios: "", observacao: "" },
              ],
            })
          }
        >
          <Plus className="mr-2 h-4 w-4" /> Adicionar quem realiza
        </Button>
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

  const textoLivre = (
    <div className="space-y-1">
      <RotuloAjuda chave="texto_livre">Texto para o paciente</RotuloAjuda>
      <Textarea
        rows={3}
        value={estado.descricao_publica}
        disabled={somenteLeitura}
        placeholder="Explicação do exame, sem preço, horário, modalidade ou idade"
        onChange={(e) => set({ descricao_publica: e.target.value })}
      />
      <AvisoTextoLivre texto={estado.descricao_publica} />
    </div>
  );

  if (organizado && estruturado)
    return (
      <ItemEstruturado.Provider value={true}>
        <div className="space-y-4">
          <SecaoCatalogo titulo="Identificação">
            <div className="grid gap-3 sm:grid-cols-2">
              {nome}
              {vinculo}
            </div>
          </SecaoCatalogo>
          <SecaoCatalogo
            titulo="Regras da Nina"
            descricao="Decidem se a Nina agenda, encaminha ou pede documentos para este item."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoNinaPodeAgendar {...estrutura} />
              <CampoEncaminhamentoHumano {...estrutura} />
              {pedidoMedico}
            </div>
          </SecaoCatalogo>
          <SecaoCatalogo titulo="Preparo e requisitos">
            <div className="grid gap-3 sm:grid-cols-2">
              {preparo}
              <CampoSituacaoPreparo {...estrutura} />
            </div>
            {restricoes}
          </SecaoCatalogo>
          <SecaoCatalogo
            titulo="Atendimentos"
            ajuda="atendimentos"
            descricao="Única fonte de quem realiza, horários, preços, modalidade e regras deste item."
          >
            <PendenciasAtendimentos
              itens={[...pendenciasConversao, ...pendenciasEstrutura("", estado.estrutura)]}
            />
            <AtendimentosEditor
              tipo="servico"
              atendimentos={listaAtendimentos}
              onChange={setAtendimentos}
              medicos={opcoes.medicos}
              somenteLeitura={somenteLeitura}
            />
            <DesfazerConversao
              copia={estado.estrutura.formato_antigo}
              somenteLeitura={somenteLeitura}
              onDesfazer={desfazer}
            />
          </SecaoCatalogo>
          <SecaoCatalogo titulo="Texto para o paciente">{textoLivre}</SecaoCatalogo>
          <SecaoCatalogo titulo="Organização interna" descricao="Não muda o atendimento da Nina.">
            <div className="grid gap-3 sm:grid-cols-2">
              <CamposOrganizacao {...estrutura} tipo="servico" />
            </div>
          </SecaoCatalogo>
          <SecaoCatalogo titulo="Nota interna">{notaInterna}</SecaoCatalogo>
        </div>
      </ItemEstruturado.Provider>
    );

  if (organizado)
    return (
      <div className="space-y-4">
        <SecaoCatalogo titulo="Identificação">
          <div className="grid gap-3 sm:grid-cols-2">
            {nome}
            {vinculo}
          </div>
        </SecaoCatalogo>
        <SecaoCatalogo
          titulo="Regras da Nina"
          descricao="Decidem se a Nina agenda, encaminha ou pede documentos para este item."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoNinaPodeAgendar {...estrutura} />
            <CampoEncaminhamentoHumano {...estrutura} />
            {pedidoMedico}
          </div>
        </SecaoCatalogo>
        <SecaoCatalogo titulo="Preparo e requisitos">
          <div className="grid gap-3 sm:grid-cols-2">
            {preparo}
            <CampoSituacaoPreparo {...estrutura} />
          </div>
          {restricoes}
        </SecaoCatalogo>
        <SecaoCatalogo titulo="Quem realiza e horários">{executantes}</SecaoCatalogo>
        <SecaoCatalogo titulo="Valores">
          {formasPagamento}
          <div className="grid gap-3 sm:grid-cols-2">
            {valorReferencia}
            {valorObservacao}
          </div>
        </SecaoCatalogo>
        <SecaoCatalogo
          titulo="Texto para o paciente e atendimentos"
          descricao="A modalidade de cada atendimento fica aqui e decide como a Nina conduz o pedido."
        >
          <ConversaoParaAtendimentos somenteLeitura={somenteLeitura} onConverter={converter} />
          {descricao}
          <ComplementosAtendimentos {...atendimentos} />
        </SecaoCatalogo>
        <SecaoCatalogo titulo="Organização interna" descricao="Não muda o atendimento da Nina.">
          <div className="grid gap-3 sm:grid-cols-2">
            <CamposOrganizacao {...estrutura} tipo="servico" />
          </div>
        </SecaoCatalogo>
        <SecaoCatalogo titulo="Nota interna">{notaInterna}</SecaoCatalogo>
      </div>
    );

  return (
    <div className="space-y-4">
      {estruturado && <AvisoItemEstruturadoClassico />}
      <EstruturaCatalogoEditor {...atendimentos} tipo="servico" />
      <div className="grid gap-3 sm:grid-cols-2">
        {nome}
        {vinculo}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {valorReferencia}
        {valorObservacao}
      </div>

      {descricao}

      <div className="grid gap-3 sm:grid-cols-2">
        {preparo}
        {restricoes}
      </div>

      {pedidoMedico}

      {notaInterna}

      {executantes}

      <Accordion type="multiple" value={abertos} onValueChange={setAbertos}>
        <AccordionItem value="pagamento">
          <AccordionTrigger>Formas de pagamento e condições</AccordionTrigger>
          <AccordionContent>{formasPagamento}</AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

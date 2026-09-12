/**
 * FASE 1 — Campos simples para a identidade de apresentação do atendimento.
 *
 * Estes três campos editam o MESMO texto que será publicado: o bloco
 * [IDENTIDADE DO ATENDIMENTO] dentro do prompt da Arquitetura. Não há cadastro
 * paralelo nem valor guardado em outro lugar — por isso editar aqui ou editar
 * o bloco à mão dá exatamente o mesmo resultado.
 */
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ABERTURA_IDENTIDADE,
  ROTULO_ASSISTENTE,
  ROTULO_ESTABELECIMENTO,
  ROTULO_TIPO,
  aplicarIdentidadeNoTexto,
  extrairIdentidade,
  montarBlocoIdentidade,
  type IdentidadeAtendimento,
} from "@/lib/nina/identidade-atendimento";

const VAZIA: IdentidadeAtendimento = {
  assistente: "",
  estabelecimento: "",
  tipoEstabelecimento: "",
};

export function IdentidadeAtendimentoCampos({
  texto,
  onTextoChange,
  somenteLeitura,
}: {
  texto: string;
  onTextoChange: (novo: string) => void;
  somenteLeitura: boolean;
}) {
  const leitura = useMemo(() => extrairIdentidade(texto), [texto]);
  const identidade = leitura.ok ? leitura.identidade : VAZIA;
  const bloqueadoParaFormulario = !leitura.ok && leitura.motivo !== "BLOCO_AUSENTE";

  const alterar = (campo: keyof IdentidadeAtendimento, valor: string) => {
    onTextoChange(aplicarIdentidadeNoTexto(texto, { ...identidade, [campo]: valor }));
  };

  const previa = leitura.ok ? leitura.bloco : montarBlocoIdentidade(identidade);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Identidade do atendimento</p>
        {leitura.ok ? (
          <Badge variant="secondary">Preenchida</Badge>
        ) : leitura.motivo === "BLOCO_AUSENTE" ? (
          <Badge variant="outline">Preenchimento necessário</Badge>
        ) : (
          <Badge variant="destructive">Corrigir antes de publicar</Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        É o nome que a assistente usa ao falar com o paciente. Não muda cadastro, documentos,
        agenda nem endereço do estabelecimento. O que vale é o bloco {ABERTURA_IDENTIDADE} do texto
        abaixo — publicar é o que passa a valer no atendimento.
      </p>

      {!leitura.ok ? (
        <p
          className={
            leitura.motivo === "BLOCO_AUSENTE"
              ? "text-xs text-muted-foreground"
              : "text-xs text-destructive"
          }
        >
          {leitura.mensagem}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="identidade-assistente" className="text-xs">
            {ROTULO_ASSISTENTE}
          </Label>
          <Input
            id="identidade-assistente"
            value={identidade.assistente}
            maxLength={60}
            placeholder="Nina"
            readOnly={somenteLeitura || bloqueadoParaFormulario}
            onChange={(e) => alterar("assistente", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="identidade-estabelecimento" className="text-xs">
            {ROTULO_ESTABELECIMENTO}
          </Label>
          <Input
            id="identidade-estabelecimento"
            value={identidade.estabelecimento}
            maxLength={120}
            placeholder="Menino Jesus"
            readOnly={somenteLeitura || bloqueadoParaFormulario}
            onChange={(e) => alterar("estabelecimento", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="identidade-tipo" className="text-xs">
            {ROTULO_TIPO}
          </Label>
          <Input
            id="identidade-tipo"
            value={identidade.tipoEstabelecimento}
            maxLength={60}
            placeholder="Policlínica"
            readOnly={somenteLeitura || bloqueadoParaFormulario}
            onChange={(e) => alterar("tipoEstabelecimento", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">Como vai ficar no texto publicado</p>
        <pre className="overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap">
          {previa}
        </pre>
      </div>
    </div>
  );
}

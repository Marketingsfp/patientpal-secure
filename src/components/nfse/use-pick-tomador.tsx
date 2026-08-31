import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CurrencyInput } from "@/components/ui/currency-input";

export interface TomadorPayload {
  nome: string;
  cpfCnpj?: string;
  email?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  /**
   * Quando o tomador é um terceiro pagador, permite descrever quem foi o
   * dependente (paciente) efetivamente atendido.
   */
  dependenteAtendido?: string;
  /**
   * Valor em reais a emitir nesta NFS-e, exatamente como o usuário digitou no
   * diálogo. É a fonte da verdade: quando presente, vence `percentualValor`.
   * Callers aplicam via `aplicarValorParcial` sobre o valor base.
   */
  valorEmitir?: number;
  /**
   * Percentual do valor do serviço a emitir nesta NFS-e (1–100). Padrão 100.
   * Mantido por compatibilidade — só é usado quando `valorEmitir` não veio.
   */
  percentualValor?: number;
}

export interface PickTomadorInput {
  /** Dados do paciente (cliente do serviço). Se null, só permite terceiro. */
  paciente: TomadorPayload | null;
  /** Rótulo do paciente para o rádio (default: paciente.nome). */
  pacienteLabel?: string;
  /** Valor total do serviço, usado no preview do valor parcial. */
  valorBase?: number;
}

const fmtBRL = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Devolve o valor a enviar à NFS-e + o sufixo que deve compor a descrição
 * quando a nota é parcial (menor que o valor do serviço).
 *
 * O valor digitado no diálogo (`valorEmitir`) manda. Antes o diálogo guardava
 * só um percentual inteiro, então valores como R$ 45,50 sobre R$ 60,00 eram
 * arredondados para o percentual mais próximo e o campo "corrigia" sozinho o
 * que o usuário tinha acabado de digitar. `percentualValor` continua aceito
 * para não quebrar quem ainda passe só o percentual.
 */
export function aplicarValorParcial(
  valorBase: number,
  tomador: TomadorPayload,
): { valor: number; descricaoSufixo: string } {
  const base = Number(valorBase) || 0;
  const digitado = Number(tomador.valorEmitir);
  if (isFinite(digitado) && digitado > 0) {
    const valor = +digitado.toFixed(2);
    // Igual (ou maior) que o serviço: nota cheia, sem sufixo de parcial.
    if (valor >= base - 0.005) return { valor, descricaoSufixo: "" };
    return {
      valor,
      descricaoSufixo: ` — Nota parcial (${fmtBRL(valor)} de ${fmtBRL(base)})`,
    };
  }
  const pct = Math.max(1, Math.min(100, Math.round(tomador.percentualValor ?? 100)));
  if (pct >= 100) return { valor: +base.toFixed(2), descricaoSufixo: "" };
  const valor = +((base * pct) / 100).toFixed(2);
  return { valor, descricaoSufixo: ` — Nota parcial (${pct}% de ${fmtBRL(base)})` };
}

function temEnderecoValido(t: TomadorPayload | null | undefined): boolean {
  return !!(t && (t.logradouro ?? "").trim());
}

/**
 * Diálogo que pergunta se a NFS-e deve ser emitida em nome do
 * paciente (cliente do serviço) ou de um terceiro pagador. Bloqueia a
 * emissão quando o tomador não tem endereço (a prefeitura preenche com
 * o endereço da Receita do CPF/CNPJ nesse caso). Permite escolher um
 * percentual do valor para emitir nota parcial.
 */
export function usePickTomador() {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"paciente" | "terceiro">("paciente");
  const [paciente, setPaciente] = useState<TomadorPayload | null>(null);
  const [pacienteLabel, setPacienteLabel] = useState<string>("");
  const [valorBase, setValorBase] = useState<number>(0);
  // Fonte da verdade do campo de valor: a string numérica que o CurrencyInput
  // guarda ("60.00", "45.50", ""). Nada de percentual no meio do caminho — era
  // o ida-e-volta valor → percentual → valor que reescrevia o que o usuário
  // digitava e fazia o campo parecer travado.
  const [valorTexto, setValorTexto] = useState<string>("");
  const [erro, setErro] = useState<string>("");
  const [terceiro, setTerceiro] = useState<TomadorPayload>({
    nome: "",
    cpfCnpj: "",
    email: "",
    cep: "",
    logradouro: "",
    numero: "",
    bairro: "",
    municipio: "",
    uf: "",
    dependenteAtendido: "",
  });
  // "Dependente atendido" é compartilhado entre os dois modos (paciente e
  // terceiro), porque também vale quando o titular financeiro paga a nota em
  // nome de um dependente. Pré-preenchemos com o nome do paciente do
  // agendamento como sugestão — o usuário pode limpar ou trocar antes de emitir.
  const [dependenteAtendido, setDependenteAtendido] = useState<string>("");
  const resolverRef = useRef<((v: TomadorPayload | null) => void) | null>(null);

  const pick = useCallback(async (input: PickTomadorInput): Promise<TomadorPayload | null> => {
    setPaciente(input.paciente);
    setPacienteLabel(input.pacienteLabel ?? input.paciente?.nome ?? "Paciente");
    // Se o paciente não tem endereço, já força o modo terceiro (com endereço).
    setModo(input.paciente && temEnderecoValido(input.paciente) ? "paciente" : "terceiro");
    const base = Number(input.valorBase) || 0;
    setValorBase(base);
    setValorTexto(base > 0 ? base.toFixed(2) : "");
    setErro("");
    setTerceiro({
      nome: "",
      cpfCnpj: "",
      email: "",
      cep: "",
      logradouro: "",
      numero: "",
      bairro: "",
      municipio: "",
      uf: "",
      dependenteAtendido: "",
    });
    setDependenteAtendido(input.paciente?.nome ?? "");
    return new Promise<TomadorPayload | null>((resolve) => {
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const confirm = () => {
    const valorEmitir = +(Number(valorTexto) || 0).toFixed(2);
    if (valorEmitir <= 0) {
      setErro("Informe o valor a emitir na NFS-e.");
      return;
    }

    if (modo === "paciente" && paciente) {
      if (!temEnderecoValido(paciente)) {
        setErro(
          "O paciente não tem endereço cadastrado. Complete o cadastro (logradouro, número, bairro, cidade/UF, CEP) antes de emitir a NFS-e — ou emita em nome de um terceiro informando o endereço.",
        );
        return;
      }
      const r = resolverRef.current;
      resolverRef.current = null;
      setOpen(false);
      r?.({
        ...paciente,
        valorEmitir,
        dependenteAtendido:
          dependenteAtendido.trim() && dependenteAtendido.trim() !== (paciente.nome ?? "").trim()
            ? dependenteAtendido.trim()
            : undefined,
      });
      return;
    }

    const nome = terceiro.nome.trim();
    const cpfCnpj = (terceiro.cpfCnpj ?? "").replace(/\D/g, "");
    if (!nome || (cpfCnpj.length !== 11 && cpfCnpj.length !== 14)) {
      setErro("Informe nome e CPF/CNPJ (11 ou 14 dígitos) do terceiro.");
      return;
    }
    if (!terceiro.logradouro?.trim()) {
      setErro(
        "Endereço do terceiro é obrigatório (logradouro). Sem endereço a prefeitura usa o cadastro da Receita para o CPF/CNPJ.",
      );
      return;
    }
    const r = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    r?.({
      nome,
      cpfCnpj,
      email: terceiro.email?.trim() || undefined,
      cep: terceiro.cep?.trim() || undefined,
      logradouro: terceiro.logradouro?.trim() || undefined,
      numero: terceiro.numero?.trim() || undefined,
      bairro: terceiro.bairro?.trim() || undefined,
      municipio: terceiro.municipio?.trim() || undefined,
      uf: terceiro.uf?.trim() || undefined,
      dependenteAtendido: dependenteAtendido.trim() || undefined,
      valorEmitir,
    });
  };

  const cancel = () => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    r?.(null);
  };

  const pacienteSemEndereco = !!paciente && !temEnderecoValido(paciente);
  // Exatamente o que está no campo — sem arredondar para percentual.
  const valorFinal = +(Number(valorTexto) || 0).toFixed(2);

  const dialog = (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) cancel();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Em nome de quem emitir a NFS-e?</DialogTitle>
          <DialogDescription>
            Escolha se a nota vai para o paciente (cliente do serviço) ou para um terceiro que pagou
            pelo atendimento.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={modo}
          onValueChange={(v) => {
            setModo(v as "paciente" | "terceiro");
            setErro("");
          }}
          className="space-y-2"
        >
          <label
            className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${modo === "paciente" ? "border-primary bg-primary/5" : ""} ${!paciente || pacienteSemEndereco ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <RadioGroupItem
              value="paciente"
              disabled={!paciente || pacienteSemEndereco}
              className="mt-0.5"
            />
            <div className="text-sm">
              <div className="font-medium">Cliente do serviço (paciente)</div>
              <div className="text-xs text-muted-foreground">
                {paciente ? pacienteLabel : "Nenhum paciente vinculado ao atendimento."}
                {paciente?.cpfCnpj ? ` • CPF/CNPJ ${paciente.cpfCnpj}` : ""}
              </div>
              {pacienteSemEndereco && (
                <div className="text-xs text-destructive mt-1">
                  Paciente sem endereço cadastrado — não é possível emitir NFS-e no nome dele.
                  Complete o cadastro do paciente para liberar esta opção.
                </div>
              )}
            </div>
          </label>
          <label
            className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${modo === "terceiro" ? "border-primary bg-primary/5" : ""}`}
          >
            <RadioGroupItem value="terceiro" className="mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">Terceiro (outro pagador)</div>
              <div className="text-xs text-muted-foreground">
                Empresa ou pessoa diferente do paciente. Endereço obrigatório.
              </div>
            </div>
          </label>
        </RadioGroup>

        {modo === "terceiro" && (
          <div className="space-y-3 border-t pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label>Nome / Razão social *</Label>
                <Input
                  value={terceiro.nome}
                  onChange={(e) => setTerceiro({ ...terceiro, nome: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>CPF/CNPJ * (só números)</Label>
                <Input
                  value={terceiro.cpfCnpj ?? ""}
                  onChange={(e) => setTerceiro({ ...terceiro, cpfCnpj: e.target.value })}
                  placeholder="11 ou 14 dígitos"
                />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input
                  value={terceiro.email ?? ""}
                  onChange={(e) => setTerceiro({ ...terceiro, email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>CEP</Label>
                <Input
                  value={terceiro.cep ?? ""}
                  onChange={(e) => setTerceiro({ ...terceiro, cep: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>UF</Label>
                <Input
                  value={terceiro.uf ?? ""}
                  onChange={(e) => setTerceiro({ ...terceiro, uf: e.target.value })}
                  maxLength={2}
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label>Logradouro *</Label>
                <Input
                  value={terceiro.logradouro ?? ""}
                  onChange={(e) => setTerceiro({ ...terceiro, logradouro: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Número</Label>
                <Input
                  value={terceiro.numero ?? ""}
                  onChange={(e) => setTerceiro({ ...terceiro, numero: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input
                  value={terceiro.bairro ?? ""}
                  onChange={(e) => setTerceiro({ ...terceiro, bairro: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label>Município</Label>
                <Input
                  value={terceiro.municipio ?? ""}
                  onChange={(e) => setTerceiro({ ...terceiro, municipio: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1 border-t pt-3">
          <Label>Dependente atendido (opcional)</Label>
          <Textarea
            rows={2}
            maxLength={200}
            placeholder="Nome do dependente / paciente efetivamente atendido"
            value={dependenteAtendido}
            onChange={(e) => setDependenteAtendido(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Se preenchido, aparecerá na descrição da NFS-e como "Dependente do pagador: …". Deixe em
            branco se o próprio tomador foi atendido.
          </p>
        </div>

        <div className="space-y-2 border-t pt-3">
          <Label>Valor a emitir na NFS-e (R$)</Label>
          <div className="flex flex-wrap items-center gap-2">
            {/* Atalhos: só preenchem o mesmo campo, não travam a digitação. */}
            {[100, 75, 50, 25].map((p) => {
              const v = +(((Number(valorBase) || 0) * p) / 100).toFixed(2);
              const ativo = Math.abs(valorFinal - v) < 0.005;
              return (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={ativo ? "default" : "outline"}
                  disabled={!valorBase}
                  onClick={() => {
                    setValorTexto(v.toFixed(2));
                    setErro("");
                  }}
                >
                  {fmtBRL(v)}
                </Button>
              );
            })}
            <div className="w-32">
              <CurrencyInput
                value={valorTexto}
                onChange={(v) => {
                  setValorTexto(v);
                  setErro("");
                }}
              />
            </div>
          </div>
          {valorBase > 0 && (
            <p className="text-xs text-muted-foreground">
              Valor total do serviço: <b>{fmtBRL(valorBase)}</b> · Nesta NFS-e:{" "}
              <b>{fmtBRL(valorFinal)}</b>
              {valorFinal > 0 && valorFinal < valorBase - 0.005 ? " (nota parcial)" : ""}
            </p>
          )}
          {valorFinal > valorBase + 0.005 && valorBase > 0 && (
            <p className="text-xs text-amber-600">
              Atenção: o valor digitado é maior que o valor do serviço.
            </p>
          )}
        </div>

        {erro && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 text-destructive text-xs p-2">
            {erro}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={cancel}>
            Cancelar
          </Button>
          <Button onClick={confirm}>Emitir nesta pessoa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { pick, dialog };
}

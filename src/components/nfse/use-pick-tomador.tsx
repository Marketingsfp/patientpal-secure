import { useCallback, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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
   * Percentual do valor do serviço a emitir nesta NFS-e (1–100). Padrão 100.
   * Callers aplicam via `aplicarValorParcial` sobre o valor base.
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
 * Aplica o percentual escolhido no picker sobre o valor base e devolve
 * o valor a enviar à NFS-e + o sufixo que deve compor a descrição
 * quando a nota é parcial (< 100%).
 */
export function aplicarValorParcial(
  valorBase: number,
  tomador: TomadorPayload,
): { valor: number; descricaoSufixo: string } {
  const pct = Math.max(1, Math.min(100, Math.round(tomador.percentualValor ?? 100)));
  const base = Number(valorBase) || 0;
  if (pct >= 100) return { valor: +base.toFixed(2), descricaoSufixo: "" };
  const valor = +(base * pct / 100).toFixed(2);
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
  const [percentual, setPercentual] = useState<number>(100);
  const [erro, setErro] = useState<string>("");
  const [terceiro, setTerceiro] = useState<TomadorPayload>({
    nome: "", cpfCnpj: "", email: "", cep: "", logradouro: "", numero: "", bairro: "", municipio: "", uf: "", dependenteAtendido: "",
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
    setValorBase(Number(input.valorBase) || 0);
    setPercentual(100);
    setErro("");
    setTerceiro({ nome: "", cpfCnpj: "", email: "", cep: "", logradouro: "", numero: "", bairro: "", municipio: "", uf: "", dependenteAtendido: "" });
    setDependenteAtendido(input.paciente?.nome ?? "");
    return new Promise<TomadorPayload | null>((resolve) => {
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const confirm = () => {
    const pct = Math.max(1, Math.min(100, Math.round(Number(percentual) || 0)));
    if (!pct) { setErro("Informe um percentual entre 1 e 100."); return; }

    if (modo === "paciente" && paciente) {
      if (!temEnderecoValido(paciente)) {
        setErro("O paciente não tem endereço cadastrado. Complete o cadastro (logradouro, número, bairro, cidade/UF, CEP) antes de emitir a NFS-e — ou emita em nome de um terceiro informando o endereço.");
        return;
      }
      const r = resolverRef.current; resolverRef.current = null;
      setOpen(false);
      r?.({
        ...paciente,
        percentualValor: pct,
        dependenteAtendido: dependenteAtendido.trim() && dependenteAtendido.trim() !== (paciente.nome ?? "").trim()
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
      setErro("Endereço do terceiro é obrigatório (logradouro). Sem endereço a prefeitura usa o cadastro da Receita para o CPF/CNPJ.");
      return;
    }
    const r = resolverRef.current; resolverRef.current = null;
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
      percentualValor: pct,
    });
  };

  const cancel = () => {
    const r = resolverRef.current; resolverRef.current = null;
    setOpen(false);
    r?.(null);
  };

  const pacienteSemEndereco = !!paciente && !temEnderecoValido(paciente);
  const valorFinal = aplicarValorParcial(valorBase, {
    nome: "", percentualValor: percentual,
  }).valor;

  const dialog = (
    <Dialog open={open} onOpenChange={(o) => { if (!o) cancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Em nome de quem emitir a NFS-e?</DialogTitle>
          <DialogDescription>
            Escolha se a nota vai para o paciente (cliente do serviço) ou para um terceiro que pagou pelo atendimento.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={modo} onValueChange={(v) => { setModo(v as "paciente" | "terceiro"); setErro(""); }} className="space-y-2">
          <label className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${modo === "paciente" ? "border-primary bg-primary/5" : ""} ${!paciente || pacienteSemEndereco ? "opacity-60 cursor-not-allowed" : ""}`}>
            <RadioGroupItem value="paciente" disabled={!paciente || pacienteSemEndereco} className="mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">Cliente do serviço (paciente)</div>
              <div className="text-xs text-muted-foreground">
                {paciente ? pacienteLabel : "Nenhum paciente vinculado ao atendimento."}
                {paciente?.cpfCnpj ? ` • CPF/CNPJ ${paciente.cpfCnpj}` : ""}
              </div>
              {pacienteSemEndereco && (
                <div className="text-xs text-destructive mt-1">
                  Paciente sem endereço cadastrado — não é possível emitir NFS-e no nome dele. Complete o cadastro do paciente para liberar esta opção.
                </div>
              )}
            </div>
          </label>
          <label className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer ${modo === "terceiro" ? "border-primary bg-primary/5" : ""}`}>
            <RadioGroupItem value="terceiro" className="mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">Terceiro (outro pagador)</div>
              <div className="text-xs text-muted-foreground">Empresa ou pessoa diferente do paciente. Endereço obrigatório.</div>
            </div>
          </label>
        </RadioGroup>

        {modo === "terceiro" && (
          <div className="space-y-3 border-t pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label>Nome / Razão social *</Label>
                <Input value={terceiro.nome} onChange={(e) => setTerceiro({ ...terceiro, nome: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>CPF/CNPJ * (só números)</Label>
                <Input value={terceiro.cpfCnpj ?? ""} onChange={(e) => setTerceiro({ ...terceiro, cpfCnpj: e.target.value })} placeholder="11 ou 14 dígitos" />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input value={terceiro.email ?? ""} onChange={(e) => setTerceiro({ ...terceiro, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>CEP</Label>
                <Input value={terceiro.cep ?? ""} onChange={(e) => setTerceiro({ ...terceiro, cep: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>UF</Label>
                <Input value={terceiro.uf ?? ""} onChange={(e) => setTerceiro({ ...terceiro, uf: e.target.value })} maxLength={2} />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label>Logradouro *</Label>
                <Input value={terceiro.logradouro ?? ""} onChange={(e) => setTerceiro({ ...terceiro, logradouro: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Número</Label>
                <Input value={terceiro.numero ?? ""} onChange={(e) => setTerceiro({ ...terceiro, numero: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input value={terceiro.bairro ?? ""} onChange={(e) => setTerceiro({ ...terceiro, bairro: e.target.value })} />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label>Município</Label>
                <Input value={terceiro.municipio ?? ""} onChange={(e) => setTerceiro({ ...terceiro, municipio: e.target.value })} />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <Label>Dependente atendido (opcional)</Label>
                <Textarea
                  rows={2}
                  maxLength={200}
                  placeholder="Nome do dependente / paciente efetivamente atendido"
                  value={terceiro.dependenteAtendido ?? ""}
                  onChange={(e) => setTerceiro({ ...terceiro, dependenteAtendido: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Aparecerá na descrição dos serviços da NFS-e.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2 border-t pt-3">
          <Label>Emitir nota de quanto do valor?</Label>
          <div className="flex flex-wrap items-center gap-2">
            {[100, 75, 50, 25].map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={percentual === p ? "default" : "outline"}
                onClick={() => { setPercentual(p); setErro(""); }}
              >
                {p}%
              </Button>
            ))}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={100}
                step={1}
                className="w-24"
                value={percentual}
                onChange={(e) => { setPercentual(Number(e.target.value) || 0); setErro(""); }}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          {valorBase > 0 && (
            <p className="text-xs text-muted-foreground">
              Valor total: <b>{fmtBRL(valorBase)}</b> · Nesta NFS-e: <b>{fmtBRL(valorFinal)}</b>
              {percentual < 100 ? " (nota parcial)" : ""}
            </p>
          )}
        </div>

        {erro && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 text-destructive text-xs p-2">
            {erro}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={cancel}>Cancelar</Button>
          <Button onClick={confirm}>Emitir nesta pessoa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { pick, dialog };
}
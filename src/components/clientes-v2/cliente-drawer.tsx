import { Link } from "@tanstack/react-router";
import { Pencil, FileText, Calendar as CalIcon, CreditCard } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  cadastroIncompleto,
  calcularIdade,
  fmtCPF,
  fmtNasc,
  fmtTel,
  pagadorLabel,
  type PacienteV2,
} from "./status-utils";

interface Props {
  paciente: PacienteV2 | null;
  onClose: () => void;
}

export function ClienteDrawer({ paciente, onClose }: Props) {
  const open = !!paciente;
  const p = paciente;
  const { label } = p ? pagadorLabel(p) : { label: "" };
  const idade = p ? calcularIdade(p.data_nascimento) : null;
  const incompleto = p ? cadastroIncompleto(p) : false;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        {p && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="truncate">{p.nome}</SheetTitle>
              <SheetDescription>
                {label} {p.ativo ? "" : "· Inativo"}
              </SheetDescription>
            </SheetHeader>

            <Separator className="my-3" />

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Info k="CPF" v={fmtCPF(p.cpf)} />
              <Info
                k="Nascimento"
                v={`${fmtNasc(p.data_nascimento)}${idade !== null ? ` · ${idade}a` : ""}`}
              />
              <Info k="Telefone" v={fmtTel(p.telefone)} />
              <Info k="Telefone 2" v={fmtTel(p.telefone2 ?? null)} />
              <Info k="E-mail" v={p.email ?? "—"} />
              <Info k="Prontuário" v={p.codigo_prontuario ?? "—"} />
              <Info k="Pasta" v={p.numero_pasta ?? "—"} />
              <Info k="Cidade" v={[p.cidade, p.estado].filter(Boolean).join("/") || "—"} />
              <Info k="Cadastro em" v={fmtNasc(p.created_at.slice(0, 10))} />
              {p.ultima_consulta && <Info k="Última consulta" v={fmtNasc(p.ultima_consulta)} />}
            </div>

            {(incompleto || p.duplicado_hint) && (
              <div className="mt-3 space-y-1">
                {incompleto && (
                  <div className="text-xs rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 px-2 py-1.5 text-amber-800 dark:text-amber-200">
                    ⚠ Cadastro incompleto — CPF, telefone ou nascimento faltando.
                  </div>
                )}
                {p.duplicado_hint && (
                  <div className="text-xs rounded border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 px-2 py-1.5 text-rose-800 dark:text-rose-200">
                    ⚠ Possível duplicidade nos resultados. Verifique antes de mesclar.
                  </div>
                )}
              </div>
            )}

            <div className="mt-auto pt-4 flex flex-col gap-2">
              <Button asChild size="sm">
                <Link to="/app/clientes/$pacienteId/editar" params={{ pacienteId: p.id }}>
                  <Pencil className="h-4 w-4 mr-2" /> Editar cadastro
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/app/agenda" search={{ pacienteId: p.id } as never}>
                  <CalIcon className="h-4 w-4 mr-2" /> Ver agenda
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/app/orcamentos" search={{ pacienteId: p.id } as never}>
                  <FileText className="h-4 w-4 mr-2" /> Ver orçamentos
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/app/cartao-beneficios/contratos" search={{ pacienteId: p.id } as never}>
                  <CreditCard className="h-4 w-4 mr-2" /> Cartão de Benefícios
                </Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="truncate">{v}</div>
    </div>
  );
}

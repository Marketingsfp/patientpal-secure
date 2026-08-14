import { AlertTriangle, Cake, Copy, Phone, PhoneOff, User, IdCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  cadastroIncompleto,
  calcularIdade,
  fmtCPF,
  fmtNasc,
  fmtTel,
  isAniversarianteHoje,
  pagadorLabel,
  semCpf,
  semTelefone,
  type PacienteV2,
} from "./status-utils";

interface Props {
  p: PacienteV2;
  compact?: boolean;
  onOpen: (p: PacienteV2) => void;
}

export function ClienteCard({ p, compact, onOpen }: Props) {
  const { tipo, label } = pagadorLabel(p);
  const incompleto = cadastroIncompleto(p);
  const aniversariante = isAniversarianteHoje(p.data_nascimento);
  const sTel = semTelefone(p);
  const sCpf = semCpf(p);
  const idade = calcularIdade(p.data_nascimento);
  const borderClass = !p.ativo
    ? "border-l-slate-400"
    : aniversariante
      ? "border-l-fuchsia-500"
      : incompleto
        ? "border-l-amber-500"
        : p.duplicado_hint
          ? "border-l-rose-500"
          : "border-l-emerald-500";

  return (
    <button
      type="button"
      onClick={() => onOpen(p)}
      className={cn(
        "w-full text-left rounded-lg border bg-card hover:bg-accent/40 transition-colors",
        "border-l-4",
        borderClass,
        compact ? "px-3 py-2" : "px-3 py-3",
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 items-center">
        <div
          className={cn(
            "shrink-0 rounded-full bg-muted grid place-items-center overflow-hidden",
            compact ? "h-8 w-8" : "h-10 w-10",
          )}
        >
          {p.foto_url ? (
            <img src={p.foto_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={cn("font-medium truncate", compact ? "text-sm" : "text-sm")}>
              {p.nome}
            </span>
            {p.codigo_prontuario && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted">
                Prontuário {p.codigo_prontuario}
              </span>
            )}
            {p.numero_pasta && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted">
                Pasta {p.numero_pasta}
              </span>
            )}
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                tipo === "associado" && "bg-emerald-50 text-emerald-800 border-emerald-200",
                tipo === "cartao" && "bg-sky-50 text-sky-800 border-sky-200",
              )}
            >
              {label}
            </Badge>
            {!p.ativo && (
              <Badge variant="secondary" className="text-[10px]">
                Inativo
              </Badge>
            )}
            {incompleto && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Cadastro incompleto
              </span>
            )}
            {sTel && !incompleto && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                <PhoneOff className="h-3 w-3" /> Sem telefone
              </span>
            )}
            {sCpf && !incompleto && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                <IdCard className="h-3 w-3" /> Sem CPF
              </span>
            )}
            {aniversariante && (
              <span className="inline-flex items-center gap-1 text-[10px] text-fuchsia-700 dark:text-fuchsia-400">
                <Cake className="h-3 w-3" /> Aniversariante hoje
              </span>
            )}
            {p.duplicado_hint && (
              <span className="inline-flex items-center gap-1 text-[10px] text-rose-700 dark:text-rose-400">
                <Copy className="h-3 w-3" /> Possível duplicidade
              </span>
            )}
          </div>
          {!compact && (
            <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
              <span>CPF: {fmtCPF(p.cpf)}</span>
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {fmtTel(p.telefone)}
              </span>
              <span>
                Nasc.: {fmtNasc(p.data_nascimento)}
                {idade !== null ? ` · ${idade}a` : ""}
              </span>
              {(p.cidade || p.estado) && (
                <span className="truncate">{[p.cidade, p.estado].filter(Boolean).join("/")}</span>
              )}
            </div>
          )}
          {compact && (
            <div className="mt-0.5 text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
              <span>{fmtCPF(p.cpf)}</span>
              <span>{fmtTel(p.telefone)}</span>
              <span>{fmtNasc(p.data_nascimento)}</span>
            </div>
          )}
        </div>

        <div className="shrink-0 text-[10px] text-muted-foreground text-right hidden sm:block">
          {p.match_reason && <div>{p.match_reason}</div>}
          {p.ultima_consulta && <div>Última: {fmtNasc(p.ultima_consulta)}</div>}
        </div>
      </div>
    </button>
  );
}

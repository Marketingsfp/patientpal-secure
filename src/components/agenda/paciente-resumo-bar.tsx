import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CalendarClock,
  Copy,
  FileText,
  MessageCircle,
  Phone,
  Stethoscope,
  User,
  Wallet,
} from "lucide-react";
import { brl } from "@/lib/financeiro/format";
import { toast } from "sonner";

type Resumo = {
  paciente_id: string;
  nome: string | null;
  telefone: string | null;
  idade: number | null;
  tipo: "associado" | "particular" | null;
  convenio_nome: string | null;
  empresa_nome: string | null;
  ultima_consulta_data: string | null;
  ultima_consulta_medico: string | null;
  ultima_consulta_especialidade: string | null;
  ultimo_exame_data: string | null;
  ultimo_exame_nome: string | null;
  pendencia_valor: number | null;
  pendencia_qtd: number | null;
  cadastro_incompleto: boolean | null;
  whatsapp_valido: boolean | null;
  faltantes: string[] | null;
};

function fmtData(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function PacienteResumoBar({
  pacienteId,
  clinicaId,
  onCompletarCadastro,
}: {
  pacienteId: string;
  clinicaId: string;
  onCompletarCadastro?: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["paciente-resumo-recepcao", pacienteId, clinicaId],
    enabled: !!pacienteId && !!clinicaId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("paciente_resumo_recepcao", {
        _paciente_id: pacienteId,
        _clinica_id: clinicaId,
      });
      if (error) throw error;
      const row = Array.isArray(data)
        ? (data[0] as Resumo | undefined)
        : (data as Resumo | undefined);
      return row ?? null;
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-md border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground animate-pulse">
        Carregando resumo do paciente…
      </div>
    );
  }
  if (!data) return null;

  const tipoAssociado = data.tipo === "associado";
  const temPendencia = (data.pendencia_valor ?? 0) > 0;

  const copiar = (v: string | null | undefined) => {
    if (!v) return;
    navigator.clipboard
      .writeText(v)
      .then(() => toast.success("Copiado"))
      .catch(() => {});
  };

  return (
    <div className="rounded-md border bg-card px-2 py-1.5 text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-1 font-medium">
        <User className="h-3 w-3" />
        {data.nome ?? "—"}
        {data.idade != null && <span className="text-muted-foreground">· {data.idade}a</span>}
      </span>

      <Badge variant={tipoAssociado ? "default" : "secondary"} className="h-4 px-1.5 text-[10px]">
        {tipoAssociado ? "Associado" : "Particular"}
      </Badge>

      {data.convenio_nome && (
        <span className="text-muted-foreground">
          Convênio: <span className="text-foreground">{data.convenio_nome}</span>
        </span>
      )}
      {data.empresa_nome && (
        <span className="text-muted-foreground">
          Empresa: <span className="text-foreground">{data.empresa_nome}</span>
        </span>
      )}

      {data.ultima_consulta_data && (
        <span
          className="inline-flex items-center gap-1 text-muted-foreground"
          title={`${data.ultima_consulta_medico ?? ""} ${data.ultima_consulta_especialidade ?? ""}`.trim()}
        >
          <Stethoscope className="h-3 w-3" />
          Últ. consulta {fmtData(data.ultima_consulta_data)}
          {data.ultima_consulta_medico && (
            <span className="text-foreground">· {data.ultima_consulta_medico}</span>
          )}
          {data.ultima_consulta_especialidade && (
            <span>· {data.ultima_consulta_especialidade}</span>
          )}
        </span>
      )}

      {data.ultimo_exame_data && (
        <span
          className="inline-flex items-center gap-1 text-muted-foreground"
          title={data.ultimo_exame_nome ?? ""}
        >
          <FileText className="h-3 w-3" /> Últ. exame {fmtData(data.ultimo_exame_data)}
          {data.ultimo_exame_nome && (
            <span className="text-foreground">· {data.ultimo_exame_nome}</span>
          )}
        </span>
      )}

      {temPendencia && (
        <Badge variant="destructive" className="h-4 px-1.5 text-[10px] gap-1">
          <Wallet className="h-3 w-3" /> Pendência {brl(data.pendencia_valor ?? 0)}
        </Badge>
      )}

      {data.cadastro_incompleto && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-5 px-1.5 text-[10px] border-amber-400 text-amber-700 hover:bg-amber-50 gap-1"
          onClick={onCompletarCadastro}
          title={`Faltam: ${(data.faltantes ?? []).join(", ") || "dados"}`}
        >
          <AlertTriangle className="h-3 w-3" /> Completar cadastro
        </Button>
      )}

      {data.telefone && (
        <button
          type="button"
          onClick={() => copiar(data.telefone)}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          title="Copiar telefone"
        >
          <Phone className="h-3 w-3" />
          <span className="text-foreground">{data.telefone}</span>
          <Copy className="h-3 w-3 opacity-50" />
        </button>
      )}

      <MessageCircle
        className={`h-3 w-3 ${data.whatsapp_valido ? "text-green-600" : "text-muted-foreground opacity-50"}`}
        aria-label={data.whatsapp_valido ? "WhatsApp válido" : "WhatsApp inválido"}
      />

      <span className="inline-flex items-center gap-1 text-muted-foreground ml-auto">
        <CalendarClock className="h-3 w-3" />
      </span>
    </div>
  );
}

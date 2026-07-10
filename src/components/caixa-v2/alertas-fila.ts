// Regras puras de detecção de alertas para itens da fila do caixa.
// Não faz IO — recebe dados e devolve badges. Testável isoladamente.

export type AlertaTipo =
  | "espera-longa"
  | "pago-aguardando"
  | "sem-pagamento"
  | "orcamento-pendente"
  | "cadastro-incompleto";

export interface AlertaBadge {
  tipo: AlertaTipo;
  label: string;
  emoji: string;
  severity: "info" | "warn" | "danger";
}

export interface FilaAlertInput {
  inicio: string;              // ISO — horário previsto/checkin
  ja_pago: boolean;
  em_atendimento?: boolean;
  tem_orcamento_pendente?: boolean;
  paciente_cpf?: string | null;
  paciente_endereco?: string | null;
  agora?: number;              // override p/ testes
}

export function detectarAlertas(f: FilaAlertInput): AlertaBadge[] {
  const now = f.agora ?? Date.now();
  const esperaMin = Math.floor((now - new Date(f.inicio).getTime()) / 60000);
  const out: AlertaBadge[] = [];

  if (!f.ja_pago && esperaMin > 20) {
    out.push({ tipo: "espera-longa", label: `Espera ${esperaMin}min`, emoji: "⏱️", severity: "warn" });
  }
  if (f.ja_pago && !f.em_atendimento) {
    out.push({ tipo: "pago-aguardando", label: "Pago aguardando", emoji: "🟢", severity: "info" });
  }
  if (f.em_atendimento && !f.ja_pago) {
    out.push({ tipo: "sem-pagamento", label: "Sem pagamento", emoji: "⚠️", severity: "danger" });
  }
  if (f.tem_orcamento_pendente) {
    out.push({ tipo: "orcamento-pendente", label: "Orçamento", emoji: "📄", severity: "info" });
  }
  const cpfOk = (f.paciente_cpf ?? "").replace(/\D/g, "").length === 11;
  const endOk = (f.paciente_endereco ?? "").trim().length > 3;
  if (!cpfOk || !endOk) {
    out.push({ tipo: "cadastro-incompleto", label: "Cadastro incompleto", emoji: "📋", severity: "warn" });
  }
  return out;
}
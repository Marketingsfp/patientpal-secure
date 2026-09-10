export type SubsystemId = "recepcao" | "gestao-pessoas" | "os-zap";

const KEY = "appshell:subsystem";
const EVT = "subsystem-change";

export const SUBSYSTEMS: Record<SubsystemId, { label: string; home: string; groups: string[] }> = {
  recepcao: {
    label: "Clínica Médica",
    home: "/app/painel",
    groups: [
      "Operação",
      "Cartão Benefícios",
      "Inteligência",
      "Marketing",
      "Cadastros",
      "Gestão",
      "Configurações",
    ],
  },
  "gestao-pessoas": {
    label: "Funcionários / RH",
    home: "/app/hr-ponto",
    groups: ["Recursos Humanos", "Gestão", "Configurações"],
  },
  "os-zap": {
    label: "OS ZAP",
    home: "/app/nina",
    groups: ["Atendimento", "Nina", "Configurações do WhatsApp"],
  },
};

const IDS = Object.keys(SUBSYSTEMS) as SubsystemId[];

export function getSubsystem(): SubsystemId | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  return IDS.includes(v as SubsystemId) ? (v as SubsystemId) : null;
}

export function setSubsystem(id: SubsystemId | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(KEY, id);
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function subscribeSubsystem(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener("storage", handler);
  };
}

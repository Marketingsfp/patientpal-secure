export type SubsystemId = "recepcao" | "gestao-pessoas";

const KEY = "appshell:subsystem";
const EVT = "subsystem-change";

export const SUBSYSTEMS: Record<SubsystemId, { label: string; groups: string[] }> = {
  "recepcao": {
    label: "Gestor Clínico",
    groups: ["Operação", "Cartão Benefícios", "Inteligência", "Marketing", "Cadastros", "RH", "Gestão", "Configurações"],
  },
  "gestao-pessoas": {
    label: "Gestão de Pessoas",
    groups: ["RH", "Gestão", "Configurações"],
  },
};

export function getSubsystem(): SubsystemId | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  return v === "recepcao" || v === "gestao-pessoas" ? v : null;
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
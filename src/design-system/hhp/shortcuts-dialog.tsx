import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HHP_SHORTCUTS } from "./tokens";

/**
 * HhpShortcutsDialog — Painel de atalhos padrão Health Hub Pro.
 * Consome HHP_SHORTCUTS por padrão; pode receber overrides do módulo.
 */
export interface HhpShortcut { k: string; label: string }
export interface HhpShortcutGroup { group: string; items: ReadonlyArray<HhpShortcut> }

export interface HhpShortcutsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groups?: ReadonlyArray<HhpShortcutGroup>;
  moduleName?: string;
}

export function HhpShortcutsDialog({
  open, onOpenChange, groups = HHP_SHORTCUTS, moduleName,
}: HhpShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">
            Atalhos de teclado
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {groups.map((g, gi) => (
            <React.Fragment key={g.group}>
              {gi > 0 && <div className="border-t border-slate-100" />}
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {g.group}
              </div>
              {g.items.map((s) => (
                <div key={s.k} className="flex items-center justify-between">
                  <span className="text-slate-600">{s.label}</span>
                  <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-mono text-slate-700">
                    {s.k}
                  </kbd>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 pt-2">
          Padrão Health Hub Pro{moduleName ? ` — ${moduleName}` : ""}.
        </p>
      </DialogContent>
    </Dialog>
  );
}
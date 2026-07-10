import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MenuV2 } from "@/components/menu-v2/menu-v2";
import { useMenuV2Flag, useMenuPrefs } from "@/hooks/use-menu-prefs";
import type { PerfilKey } from "@/components/menu-v2/menu-catalog";

export const Route = createFileRoute("/_authenticated/app/dev-menu-shell")({
  component: DevMenuShell,
  head: () => ({
    meta: [
      { title: "Preview — Menu Inteligente (dev)" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function DevMenuShell() {
  const { enabled, loading, setEnabled } = useMenuV2Flag();
  const { pushRecent } = useMenuPrefs();
  const [perfil, setPerfil] = useState<PerfilKey>("gestor");

  return (
    <div className="h-[calc(100vh-56px)] flex">
      {enabled && <MenuV2 perfil={perfil} />}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-3xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Menu Inteligente — Preview</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Rota isolada de testes. Não afeta o menu de produção.
            </p>
          </div>

          <div className="border rounded-lg p-4 space-y-4 bg-card">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">
                  Feature flag <code className="text-xs bg-muted px-1 rounded">menu_v2</code>
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Persistida em <code>profiles.preferencias_ui.flags.menu_v2</code>.
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={loading}
                onCheckedChange={(v) => void setEnabled(v)}
                data-testid="flag-menu-v2"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Simular perfil</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Fixados e centros mudam conforme o perfil.
                </p>
              </div>
              <Select value={perfil} onValueChange={(v) => setPerfil(v as PerfilKey)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recepcao">Recepção</SelectItem>
                  <SelectItem value="medico">Médico</SelectItem>
                  <SelectItem value="caixa">Caixa</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                  <SelectItem value="gestor">Gestor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-3 bg-card">
            <h2 className="font-semibold">Testes rápidos</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => pushRecent({ path: "/app/agenda", label: "Agenda" })}
              >
                Simular visita: Agenda
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => pushRecent({ path: "/app/caixa", label: "Caixa" })}
              >
                Simular visita: Caixa
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => pushRecent({ path: "/app/clientes", label: "Clientes" })}
              >
                Simular visita: Clientes
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cada botão adiciona uma entrada em Recentes (persistência com debounce de 2s).
            </p>
          </div>

          <div className="border rounded-lg p-4 space-y-2 bg-card text-sm">
            <h2 className="font-semibold">Status</h2>
            <ul className="text-muted-foreground space-y-1">
              <li>
                • Flag <code>menu_v2</code>: <b>{enabled ? "ligada" : "desligada"}</b>
              </li>
              <li>
                • Perfil simulado: <b>{perfil}</b>
              </li>
              <li>
                • Nomenclatura: apenas Cartão de Benefícios / Associados / Empresas Associadas — sem
                "Convênio".
              </li>
              <li>
                • Menu de produção: <b>intocado</b> (renderizado apenas nesta rota quando a flag
                está on).
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

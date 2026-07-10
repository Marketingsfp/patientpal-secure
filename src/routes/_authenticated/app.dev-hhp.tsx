import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Shield,
  Users,
  XCircle,
} from "lucide-react";
import { useClinica } from "@/hooks/use-clinica";
import { Button } from "@/components/ui/button";
import {
  HhpChip,
  HhpDrawer,
  HhpEmptyState,
  HhpKpiCard,
  HhpKpiRow,
  HhpPageHeader,
  HhpShortcutsDialog,
  HhpSkeletonList,
  HhpToolbar,
  HhpToolbarPill,
  HhpWizardShell,
} from "@/design-system/hhp";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/_authenticated/app/dev-hhp")({
  component: HhpShowcase,
  head: () => ({
    meta: [{ title: "HHP · Showcase (dev)" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});

function HhpShowcase() {
  const { clinicaAtual } = useClinica();
  const role = clinicaAtual?.role ?? null;
  const podeVer = role === "admin" || role === "gestor";
  const [drawer, setDrawer] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [density, setDensity] = useState<"confortavel" | "compacto" | "foco">("confortavel");
  const compact = density === "compacto";

  if (!podeVer) {
    return (
      <div className="h-[calc(100vh-56px)] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold">HHP Showcase — restrito</h1>
          <p className="text-sm text-muted-foreground">
            Disponível para <b>admin</b> e <b>gestor</b>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-[calc(100vh-56px)] flex flex-col"
      style={{ background: "var(--hhp-surface-page)" }}
    >
      <HhpPageHeader
        title="Health Hub Pro · Showcase"
        eyebrow="Design System · exemplos vivos"
        actions={
          <>
            <HhpToolbarPill>
              <ToggleGroup
                type="single"
                value={density}
                onValueChange={(v) => v && setDensity(v as typeof density)}
              >
                <ToggleGroupItem
                  value="confortavel"
                  className="h-8 px-3 rounded-xl text-xs data-[state=on]:bg-white"
                >
                  Confortável
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="compacto"
                  className="h-8 px-3 rounded-xl text-xs data-[state=on]:bg-white"
                >
                  Compacto
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="foco"
                  className="h-8 px-3 rounded-xl text-xs data-[state=on]:bg-white"
                >
                  Foco
                </ToggleGroupItem>
              </ToggleGroup>
            </HhpToolbarPill>
            <Button size="sm" onClick={() => setShortcuts(true)}>
              Atalhos (?)
            </Button>
            <Button size="sm" variant="outline" onClick={() => setWizard(true)}>
              Abrir wizard
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDrawer(true)}>
              Abrir drawer
            </Button>
          </>
        }
      >
        <HhpToolbar>
          <HhpChip tone="info" dot>
            Confirmado
          </HhpChip>
          <HhpChip tone="warn" dot>
            Aguardando
          </HhpChip>
          <HhpChip tone="ok" dot>
            Realizado
          </HhpChip>
          <HhpChip tone="danger" dot>
            Cancelado
          </HhpChip>
          <HhpChip tone="focus" dot>
            Em foco
          </HhpChip>
        </HhpToolbar>
        <HhpKpiRow compact={compact}>
          <HhpKpiCard
            label="Total"
            value={54}
            tone="info"
            icon={Users}
            compact={compact}
            onClick={() => {}}
          />
          <HhpKpiCard
            label="Aguardando"
            value={12}
            tone="warn"
            icon={Calendar}
            compact={compact}
            onClick={() => {}}
          />
          <HhpKpiCard
            label="Confirmados"
            value={20}
            tone="info"
            icon={CheckCircle2}
            compact={compact}
            onClick={() => {}}
          />
          <HhpKpiCard
            label="Realizados"
            value={18}
            tone="ok"
            icon={Activity}
            compact={compact}
            onClick={() => {}}
          />
          <HhpKpiCard
            label="Cancelados"
            value={4}
            tone="danger"
            icon={XCircle}
            compact={compact}
            onClick={() => {}}
          />
          <HhpKpiCard
            label="Pendências"
            value={7}
            tone="warn"
            icon={ClipboardList}
            compact={compact}
            onClick={() => {}}
          />
        </HhpKpiRow>
      </HhpPageHeader>

      <div className="flex-1 overflow-y-auto p-3 md:p-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-slate-100 bg-white p-5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
            Skeletons
          </div>
          <HhpSkeletonList count={4} density={density} />
        </section>
        <section className="rounded-3xl border border-slate-100 bg-white p-5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
            Empty state
          </div>
          <HhpEmptyState
            icon={Calendar}
            title="Nenhum item para os filtros atuais"
            description="Ajuste os filtros ou limpe a busca para ver mais resultados."
            action={
              <Button size="sm" variant="outline">
                Limpar filtros
              </Button>
            }
          />
        </section>
      </div>

      <HhpDrawer
        open={drawer}
        onOpenChange={setDrawer}
        title="Drawer padrão HHP"
        hiddenTitle={false}
        description="Exemplo de Sheet lateral do design system."
      >
        <div className="p-6 space-y-3 text-sm text-slate-600">
          <p>
            Este é o <b>HhpDrawer</b>. Serve como Centro de Atendimento (paciente), detalhe de
            lançamento (Financeiro), detalhe de lead (CRM) etc.
          </p>
          <p>Largura máxima em md+: 520 px; mobile ocupa 100% da largura.</p>
        </div>
      </HhpDrawer>

      <HhpWizardShell
        open={wizard}
        onOpenChange={setWizard}
        title="Wizard de exemplo"
        description="Demonstração do HhpWizardShell."
        stepLabel="Passo 2 de 4"
        stepIndex={1}
        stepsCount={4}
        heading="Qual o próximo passo?"
        footer={
          <>
            <Button variant="ghost">Voltar</Button>
            <Button onClick={() => setWizard(false)}>Continuar</Button>
          </>
        }
      >
        <div className="text-sm text-slate-600">
          Corpo do passo — cada módulo preenche aqui com formulário próprio.
        </div>
      </HhpWizardShell>

      <HhpShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} moduleName="Showcase" />
    </div>
  );
}

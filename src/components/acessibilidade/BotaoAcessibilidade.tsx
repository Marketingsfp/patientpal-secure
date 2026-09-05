import { useState } from "react";
import { Accessibility, RotateCcw } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAcessibilidade } from "./AcessibilidadeProvider";
import type { A11yPrefs, ColorVision, Densidade, FontScale } from "@/lib/acessibilidade/prefs";

const ESCALAS: { valor: FontScale; label: string; titulo: string }[] = [
  { valor: 0.9, label: "A−", titulo: "Texto 90%" },
  { valor: 1, label: "A", titulo: "Texto 100%" },
  { valor: 1.15, label: "A+", titulo: "Texto 115%" },
  { valor: 1.35, label: "A++", titulo: "Texto 135%" },
];

const DENSIDADES: { valor: Densidade; label: string }[] = [
  { valor: "compacta", label: "Compacta" },
  { valor: "confortavel", label: "Confortável" },
  { valor: "grande", label: "Grande" },
];

const CORES: { valor: ColorVision; label: string }[] = [
  { valor: "padrao", label: "Modo padrão" },
  { valor: "protanopia", label: "Protanopia" },
  { valor: "deuteranopia", label: "Deuteranopia" },
  { valor: "tritanopia", label: "Tritanopia" },
];

const ATALHOS: { teclas: string; acao: string }[] = [
  { teclas: "Ctrl + K", acao: "Buscar paciente/conversa" },
  { teclas: "Alt + A", acao: "Agendar" },
  { teclas: "Alt + T", acao: "Transferir conversa" },
  { teclas: "Alt + R", acao: "Encerrar conversa (abre confirmação)" },
  { teclas: "Ctrl + Enter", acao: "Enviar mensagem" },
  { teclas: "Esc", acao: "Fechar painéis e modais" },
];

function LinhaSwitch({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

export function BotaoAcessibilidade() {
  const { prefs, set, restaurarPadrao, anunciar } = useAcessibilidade();
  const [aberto, setAberto] = useState(false);
  const [confirmarReset, setConfirmarReset] = useState(false);
  const [verAtalhos, setVerAtalhos] = useState(false);

  const toggle = (chave: keyof A11yPrefs, label: string) => (v: boolean) => {
    set(chave, v as never);
    anunciar(`${label} ${v ? "ativado" : "desativado"}`);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAberto(true)}
        className="h-9 w-9 p-0 rounded-full text-slate-700 hover:bg-slate-100 hover:text-slate-900"
        aria-label="Acessibilidade"
        aria-haspopup="dialog"
        title="Acessibilidade"
      >
        <Accessibility className="h-[18px] w-[18px]" />
      </Button>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="right" className="w-[360px] sm:max-w-[380px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Accessibility className="h-5 w-5" aria-hidden="true" /> Acessibilidade
            </SheetTitle>
            <SheetDescription>
              Estas configurações valem apenas para a sua conta.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-5">
            <Secao titulo="Texto">
              <div role="group" aria-label="Tamanho do texto" className="flex gap-1.5">
                {ESCALAS.map((e) => (
                  <button
                    key={e.valor}
                    type="button"
                    title={e.titulo}
                    aria-pressed={prefs.fontScale === e.valor}
                    onClick={() => {
                      set("fontScale", e.valor);
                      anunciar(`Tamanho do texto ${Math.round(e.valor * 100)} por cento`);
                    }}
                    className={cn(
                      "flex-1 h-10 rounded-lg border text-sm font-semibold transition-colors",
                      prefs.fontScale === e.valor
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </Secao>

            <Secao titulo="Densidade da interface">
              <div role="group" aria-label="Densidade da interface" className="flex gap-1.5">
                {DENSIDADES.map((d) => (
                  <button
                    key={d.valor}
                    type="button"
                    aria-pressed={prefs.densidade === d.valor}
                    onClick={() => {
                      set("densidade", d.valor);
                      anunciar(`Densidade ${d.label}`);
                    }}
                    className={cn(
                      "flex-1 h-10 rounded-lg border text-xs font-semibold transition-colors",
                      prefs.densidade === d.valor
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </Secao>

            <Secao titulo="Visual">
              <LinhaSwitch
                id="a11y-contraste"
                label="Alto contraste"
                checked={prefs.altoContraste}
                onChange={toggle("altoContraste", "Alto contraste")}
              />
              <LinhaSwitch
                id="a11y-escuro"
                label="Modo escuro"
                checked={prefs.modoEscuro}
                onChange={toggle("modoEscuro", "Modo escuro")}
              />
              <LinhaSwitch
                id="a11y-botoes"
                label="Botões maiores"
                checked={prefs.botoesMaiores}
                onChange={toggle("botoesMaiores", "Botões maiores")}
              />
              <LinhaSwitch
                id="a11y-espaco"
                label="Aumentar espaçamento"
                checked={prefs.espacamentoMaior}
                onChange={toggle("espacamentoMaior", "Espaçamento maior")}
              />
              <LinhaSwitch
                id="a11y-selecao"
                label="Destacar elemento selecionado"
                checked={prefs.destacarSelecionado}
                onChange={toggle("destacarSelecionado", "Destaque da seleção")}
              />
            </Secao>

            <Secao titulo="Movimento">
              <LinhaSwitch
                id="a11y-animacao"
                label="Reduzir animações"
                checked={prefs.reduzirAnimacoes}
                onChange={toggle("reduzirAnimacoes", "Redução de animações")}
              />
            </Secao>

            <Secao titulo="Cores">
              <div role="radiogroup" aria-label="Modo de cores" className="grid grid-cols-2 gap-1.5">
                {CORES.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    role="radio"
                    aria-checked={prefs.visaoCores === c.valor}
                    onClick={() => {
                      set("visaoCores", c.valor);
                      anunciar(`Cores: ${c.label}`);
                    }}
                    className={cn(
                      "h-9 rounded-lg border text-xs font-medium transition-colors",
                      prefs.visaoCores === c.valor
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </Secao>

            <Secao titulo="Concentração">
              <LinhaSwitch
                id="a11y-foco"
                label="Modo foco"
                checked={prefs.modoFoco}
                onChange={toggle("modoFoco", "Modo foco")}
              />
            </Secao>

            <Secao titulo="Navegação">
              <LinhaSwitch
                id="a11y-foco-teclado"
                label="Destacar navegação por teclado"
                checked={prefs.destacarFocoTeclado}
                onChange={toggle("destacarFocoTeclado", "Destaque do foco")}
              />
              <LinhaSwitch
                id="a11y-atalhos"
                label="Atalhos de teclado"
                checked={prefs.atalhosTeclado}
                onChange={toggle("atalhosTeclado", "Atalhos de teclado")}
              />
              <button
                type="button"
                onClick={() => setVerAtalhos((v) => !v)}
                aria-expanded={verAtalhos}
                className="text-xs font-medium text-primary underline underline-offset-2"
              >
                Ver atalhos disponíveis
              </button>
              {verAtalhos && (
                <ul className="mt-1 space-y-1 rounded-lg border border-border bg-muted/40 p-2">
                  {ATALHOS.map((a) => (
                    <li key={a.teclas} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{a.acao}</span>
                      <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">
                        {a.teclas}
                      </kbd>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>

            <Secao titulo="Alertas sonoros">
              <p className="text-[11px] text-muted-foreground">
                O som é sempre um complemento: toda informação também aparece na tela.
              </p>
              {(
                [
                  ["novaMensagem", "Nova mensagem"],
                  ["novaConversa", "Nova conversa"],
                  ["naoAtribuida", "Conversa não atribuída"],
                  ["transferencia", "Transferência"],
                  ["filaCritica", "Fila crítica"],
                ] as const
              ).map(([chave, label]) => (
                <LinhaSwitch
                  key={chave}
                  id={`a11y-som-${chave}`}
                  label={label}
                  checked={prefs.sons[chave]}
                  onChange={(v) => set("sons", { ...prefs.sons, [chave]: v })}
                />
              ))}
            </Secao>

            <div className="border-t border-border pt-3">
              {confirmarReset ? (
                <div className="space-y-2">
                  <p className="text-sm">Deseja restaurar todas as configurações de acessibilidade?</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        restaurarPadrao();
                        setConfirmarReset(false);
                        anunciar("Configurações de acessibilidade restauradas");
                      }}
                    >
                      Restaurar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmarReset(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setConfirmarReset(true)}
                >
                  <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
                  Restaurar configurações padrão
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

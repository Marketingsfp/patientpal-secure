import { useState, type ReactNode } from "react";
import {
  BookOpen,
  Keyboard,
  LayoutList,
  Palette,
  RotateCcw,
  ChevronDown,
  Check,
} from "lucide-react";
import { useAcessibilidade } from "./AcessibilidadeProvider";
import { A11Y_DEFAULTS, type A11yPrefs } from "@/lib/acessibilidade/prefs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

function Grupo({
  titulo,
  icon,
  children,
  aberto = false,
}: {
  titulo: string;
  icon: ReactNode;
  children: ReactNode;
  aberto?: boolean;
}) {
  return (
    <details open={aberto} className="oszap-access-group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-sm font-semibold">
        {icon}
        <span className="flex-1">{titulo}</span>
        <ChevronDown className="h-4 w-4 oszap-access-chevron" />
      </summary>
      <div className="space-y-4 border-t p-3">{children}</div>
    </details>
  );
}

function Opcao({
  id,
  titulo,
  descricao,
  ativo,
  mudar,
}: {
  id: string;
  titulo: string;
  descricao: string;
  ativo: boolean;
  mudar: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-medium">{titulo}</span>
        <span
          id={`${id}-ajuda`}
          className="mt-1 block text-xs leading-relaxed text-muted-foreground"
        >
          {descricao}
        </span>
      </label>
      <Switch
        id={id}
        aria-label={titulo}
        aria-describedby={`${id}-ajuda`}
        checked={ativo}
        onCheckedChange={mudar}
        className="oszap-access-switch shrink-0"
      />
    </div>
  );
}

const RESET: Partial<A11yPrefs> = {
  fontScale: 1,
  densidade: "compacta",
  altoContraste: false,
  modoEscuro: false,
  botoesMaiores: false,
  espacamentoMaior: false,
  destacarSelecionado: false,
  reduzirAnimacoes: false,
  visaoCores: "padrao",
  modoFoco: false,
  destacarFocoTeclado: true,
  atalhosTeclado: true,
  oszap: A11Y_DEFAULTS.oszap,
};

/** Configuração funcional do atendimento. A gaveta dos demais portais é preservada. */
export function AjustesOsZap() {
  const { prefs, ajustar, anunciar } = useAcessibilidade();
  const [confirmar, setConfirmar] = useState(false);
  const aplicar = (patch: Partial<A11yPrefs>, texto: string) => {
    ajustar(patch);
    anunciar(texto);
  };
  const oszap = (chave: keyof A11yPrefs["oszap"], valor: boolean) =>
    aplicar({ oszap: { ...prefs.oszap, [chave]: valor } }, "Ajuste do atendimento atualizado");
  return (
    <div className="oszap-access-settings mt-5 space-y-3">
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">COMEÇAR COM UM PERFIL</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-auto items-start justify-start gap-2 whitespace-normal px-3 py-3 text-left"
            onClick={() =>
              aplicar(
                {
                  fontScale: 1,
                  densidade: "compacta",
                  botoesMaiores: false,
                  espacamentoMaior: false,
                  modoFoco: false,
                  oszap: { ...prefs.oszap, mensagensEspacadas: false },
                },
                "Perfil Mais conversas aplicado",
              )
            }
          >
            <LayoutList className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b className="block text-xs">Mais conversas</b>
              <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                Lista compacta
              </span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto items-start justify-start gap-2 whitespace-normal px-3 py-3 text-left"
            onClick={() =>
              aplicar(
                {
                  fontScale: 1.15,
                  densidade: "confortavel",
                  botoesMaiores: false,
                  espacamentoMaior: false,
                  modoFoco: false,
                  oszap: { ...prefs.oszap, mensagensEspacadas: true },
                },
                "Perfil Leitura confortável aplicado",
              )
            }
          >
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b className="block text-xs">Leitura confortável</b>
              <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                Texto e respiro
              </span>
            </span>
          </Button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Os perfis ajustam texto e espaço. Mantêm seu tema e suas opções de envio.
        </p>
      </div>
      <Grupo titulo="Leitura e tamanho" icon={<BookOpen className="h-4 w-4" />} aberto>
        <div>
          <p className="mb-2 text-xs font-medium">Tamanho do texto</p>
          <div role="group" aria-label="Tamanho do texto" className="grid grid-cols-4 gap-1">
            {([0.9, 1, 1.15, 1.35] as const).map((valor) => (
              <button
                type="button"
                key={valor}
                title={`Texto ${Math.round(valor * 100)}%`}
                aria-pressed={prefs.fontScale === valor}
                onClick={() =>
                  aplicar({ fontScale: valor }, `Texto ${Math.round(valor * 100)} por cento`)
                }
                className={cn(
                  "rounded-lg border px-1 py-2 text-xs font-semibold",
                  prefs.fontScale === valor
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                )}
              >
                {Math.round(valor * 100)}%
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Também ajusta o texto das mensagens do chat.
          </p>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium">Espaço dos controles</p>
          <div role="group" aria-label="Espaço dos controles" className="grid grid-cols-3 gap-1">
            {(
              [
                { valor: "compacta", label: "Compacto" },
                { valor: "confortavel", label: "Confortável" },
                { valor: "grande", label: "Amplo" },
              ] as const
            ).map((d) => (
              <button
                type="button"
                key={d.valor}
                aria-pressed={prefs.densidade === d.valor}
                onClick={() =>
                  aplicar(
                    { densidade: d.valor, botoesMaiores: false, espacamentoMaior: false },
                    `Espaço ${d.label}`,
                  )
                }
                className={cn(
                  "rounded-lg border px-1 py-2 text-[11px] font-medium",
                  prefs.densidade === d.valor
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <Opcao
          id="oszap-leitura"
          titulo="Mais espaço entre as linhas"
          descricao="Facilita a leitura de mensagens longas no chat."
          ativo={prefs.oszap.mensagensEspacadas}
          mudar={(v) => oszap("mensagensEspacadas", v)}
        />
      </Grupo>
      <Grupo titulo="Conforto visual" icon={<Palette className="h-4 w-4" />} aberto>
        <Opcao
          id="oszap-escuro"
          titulo="Modo escuro"
          descricao="Troca o fundo claro por tons escuros."
          ativo={prefs.modoEscuro}
          mudar={(v) =>
            aplicar({ modoEscuro: v }, v ? "Modo escuro ativado" : "Modo claro ativado")
          }
        />
        <Opcao
          id="oszap-contraste"
          titulo="Contraste reforçado"
          descricao="Reforça textos, campos e divisórias."
          ativo={prefs.altoContraste}
          mudar={(v) => aplicar({ altoContraste: v }, "Contraste atualizado")}
        />
        <Opcao
          id="oszap-cores"
          titulo="Diferenciar os avisos"
          descricao="Usa azul e laranja, com bordas diferentes para esperas críticas."
          ativo={prefs.oszap.coresDistintas}
          mudar={(v) =>
            aplicar(
              { oszap: { ...prefs.oszap, coresDistintas: v }, visaoCores: "padrao" },
              "Cores dos avisos atualizadas",
            )
          }
        />
        <div
          className="flex flex-wrap gap-2 rounded-lg bg-muted p-2 text-[11px]"
          aria-label="Prévia dos avisos"
        >
          <span className="rounded border border-atd-ok bg-atd-ok-bg px-2 py-1 text-atd-ok-ink">
            ● Disponível
          </span>
          <span
            data-wait-level="critico"
            className="rounded border border-atd-danger bg-atd-danger-bg px-2 py-1 text-atd-danger-ink"
          >
            ! Espera crítica
          </span>
        </div>
        <Opcao
          id="oszap-animacoes"
          titulo="Reduzir movimentos"
          descricao="Diminui animações. Os avisos de pendência continuam visíveis."
          ativo={prefs.reduzirAnimacoes}
          mudar={(v) => aplicar({ reduzirAnimacoes: v }, "Preferência de movimentos atualizada")}
        />
      </Grupo>
      <Grupo titulo="Teclado e envio" icon={<Keyboard className="h-4 w-4" />}>
        <Opcao
          id="oszap-foco"
          titulo="Foco de teclado reforçado"
          descricao="Destaca o controle que você está usando com Tab."
          ativo={prefs.destacarFocoTeclado}
          mudar={(v) => aplicar({ destacarFocoTeclado: v }, "Foco de teclado atualizado")}
        />
        <Opcao
          id="oszap-selecao"
          titulo="Destacar conversa selecionada"
          descricao="Reforça a borda da conversa aberta na lista."
          ativo={prefs.destacarSelecionado}
          mudar={(v) => aplicar({ destacarSelecionado: v }, "Seleção de conversa atualizada")}
        />
        <Opcao
          id="oszap-enter"
          titulo="Enter envia a mensagem"
          descricao="Desative para usar Enter como quebra de linha. Ctrl+Enter continua enviando no campo de resposta."
          ativo={prefs.oszap.enterEnvia}
          mudar={(v) => oszap("enterEnvia", v)}
        />
        <Opcao
          id="oszap-atalhos"
          titulo="Atalhos de atendimento"
          descricao="Alt+T abre transferência; Alt+R abre a confirmação de encerramento, quando disponíveis."
          ativo={prefs.atalhosTeclado}
          mudar={(v) => aplicar({ atalhosTeclado: v }, "Atalhos atualizados")}
        />
        <p className="rounded-lg bg-muted p-2 text-xs leading-relaxed">
          <b>Shift+Enter</b> quebra a linha. <b>Esc</b> fecha este painel quando o foco está nele.
        </p>
      </Grupo>
      <p className="flex gap-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Os ajustes são pessoais. Não alteram a Nina, as prioridades da fila ou as mensagens dos
        pacientes.
      </p>
      <div className="border-t pt-3">
        {confirmar ? (
          <div className="space-y-2" role="group" aria-label="Confirmar restauração">
            <p className="text-xs">Restaurar os ajustes deste painel?</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  aplicar(RESET, "Ajustes restaurados");
                  setConfirmar(false);
                }}
              >
                Restaurar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => setConfirmar(true)}
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            Restaurar ajustes
          </Button>
        )}
      </div>
    </div>
  );
}

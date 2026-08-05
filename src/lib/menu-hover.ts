/**
 * Efeito de "expandir ao passar o mouse" nos itens do menu lateral.
 *
 * A aba cresce levemente (scale) no hover e volta ao normal ao sair, com
 * transição suave. Respeita `prefers-reduced-motion` e é neutralizado em
 * dispositivos sem hover (touch), para não travar em estado ampliado.
 *
 * Escopo de ativação: controlado pela feature flag de clínica
 * `menu_hover_scale` (`useClinicFeatureFlag`) — hoje ligada apenas para a
 * Policlínica São Francisco de Paula. Usado no menu lateral (`app-shell.tsx`).
 */
export const HOVER_SCALE_CLASSES =
  "relative transform-gpu origin-center transition-all duration-200 ease-out hover:z-10 hover:scale-[1.04] hover:shadow-md active:scale-[0.98] motion-reduce:transform-none motion-reduce:hover:scale-100 [@media(hover:none)]:hover:scale-100 [@media(hover:none)]:hover:shadow-none [@media(hover:none)]:active:scale-100";

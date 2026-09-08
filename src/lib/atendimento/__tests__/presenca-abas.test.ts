import { expect, test } from "bun:test";
import {
  ABA_VIVA_MS,
  outraAbaAtiva,
  outraAbaViva,
  registrarNoMapa,
  removerDoMapa,
  type EstadoAba,
} from "../presenca-abas";

const agora = 1_000_000;
const viva = (id: string, ativa: boolean): EstadoAba => ({ id, ativa, ts: agora - 1_000 });
const velha = (id: string): EstadoAba => ({ id, ativa: true, ts: agora - ABA_VIVA_MS - 1 });

test("uma aba do mesmo usuário não vira dois atendentes", () => {
  const mapa = registrarNoMapa(registrarNoMapa([], viva("a", true), agora), viva("a", false), agora);
  expect(mapa.filter((x) => x.id === "a")).toHaveLength(1);
});

test("fechar uma aba com outra aberta não derruba a presença", () => {
  const mapa = [viva("a", true), viva("b", true)];
  expect(outraAbaViva(mapa, "a", agora)).toBe(true);
  expect(removerDoMapa(mapa, "a", agora)).toHaveLength(1);
});

test("fechar a última aba libera o OFFLINE", () => {
  expect(outraAbaViva([viva("a", true)], "a", agora)).toBe(false);
});

test("aba em segundo plano não marca ausente se a outra está ativa", () => {
  expect(outraAbaAtiva([viva("a", false), viva("b", true)], "a", agora)).toBe(true);
  expect(outraAbaAtiva([viva("a", false), viva("b", false)], "a", agora)).toBe(false);
});

test("aba sem sinal recente é descartada (navegador fechado à força)", () => {
  expect(outraAbaViva([velha("z")], "a", agora)).toBe(false);
  expect(registrarNoMapa([velha("z")], viva("a", true), agora)).toHaveLength(1);
});

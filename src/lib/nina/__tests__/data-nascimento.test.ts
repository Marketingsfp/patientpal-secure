import { expect, test } from "bun:test";
import { encontrarDataNascimento } from "../data-nascimento";

test("todos os meses por extenso, com ou sem de, acento e caixa alta", () => {
  const meses = [
    "janeiro",
    "fevereiro",
    "MARÇO",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  for (const [i, mes] of meses.entries()) {
    expect(encontrarDataNascimento(`nasci em 15 de ${mes} de 1979`)?.data).toBe(
      `1979-${String(i + 1).padStart(2, "0")}-15`,
    );
  }
  expect(encontrarDataNascimento("1º marco 1979")?.data).toBe("1979-03-01");
  expect(encontrarDataNascimento("29 de fevereiro de 2000")?.data).toBe("2000-02-29");
});

test.each([
  "31 de abril de 1979",
  "29 de fevereiro de 1979",
  "31/02/1979",
  "1979-02-31",
  "15 de janeiro de 2999",
  "00 de janeiro de 1979",
])("não inventa uma data para %s", (texto) => {
  expect(encontrarDataNascimento(texto)?.data).toBeNull();
});

test("não interpreta data de três dígitos nem texto sem nascimento", () => {
  expect(encontrarDataNascimento("15/01/979")).toBeNull();
  expect(encontrarDataNascimento("Ana Silva")).toBeNull();
});

test("ano antes do dia e números separados por espaço (testes de 07/10/2026)", () => {
  expect(encontrarDataNascimento("sebastiao alves de lima 1950 dia 20 de julho")).toEqual({
    trecho: "1950 dia 20 de julho",
    data: "1950-07-20",
  });
  expect(encontrarDataNascimento("1964, 17 de janeiro")?.data).toBe("1964-01-17");
  expect(encontrarDataNascimento("jessica oliveira santos 02 04 2001")).toEqual({
    trecho: "02 04 2001",
    data: "2001-04-02",
  });
  expect(encontrarDataNascimento("31 02 1979")?.data).toBeNull();
});

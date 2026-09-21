/**
 * Testes da leitura e conferência da planilha de importação de médicos.
 *
 * O ponto mais sensível é o repasse: em branco herda o repasse padrão do
 * médico, 0 digitado zera. Um erro aí faz o financeiro pagar errado ou marcar
 * atendimento como "Sem repasse". Os demais cobrem o que evita cadastro
 * duplicado e gravação fora do catálogo da clínica aberta.
 */
import { describe, expect, it } from "bun:test";
import * as XLSX from "xlsx";

import {
  ABA_MEDICOS,
  ABA_REPASSES,
  CABECALHO_MEDICOS,
  CABECALHO_REPASSES,
  chaveCrm,
  conferirImportacaoMedicos,
  lerPlanilhaMedicos,
  montarModeloMedicos,
  normalizarCpf,
  normalizarTipoRepasse,
  numeroOuNulo,
  resolverEspecialidade,
  repasseTemExcecao,
  separarEspecialidades,
  type OpcoesConferencia,
} from "./importar-medicos";

type Celula = string | number | null;

/** Linha da aba Médicos a partir de um objeto com os rótulos do modelo. */
function linhaMedico(campos: Record<string, Celula>): Celula[] {
  return CABECALHO_MEDICOS.map((h) => campos[h] ?? "");
}
function linhaRepasse(campos: Record<string, Celula>): Celula[] {
  return CABECALHO_REPASSES.map((h) => campos[h] ?? "");
}

function arquivo(abas: Record<string, Celula[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const MEDICO_OK = {
  Nome: "Dr. Carlos Lima",
  CRM: "52111111-1",
  "UF do CRM": "RJ",
  Especialidades: "Cardiologia",
  "Tipo de Repasse": "Percentual",
  "Repasse Padrão": "60",
  Telefone: "(21) 99999-0000",
};

const ESPECIALIDADES = [
  { id: "esp-cardio", nome: "CARDIOLOGIA" },
  { id: "esp-usg", nome: "ULTRASSONOGRAFIA" },
];
const SERVICOS = [
  { id: "srv-consulta", nome: "CONSULTA CARDIOLOGIA" },
  { id: "srv-ecg", nome: "ELETROCARDIOGRAMA" },
];
const opcoes = (extra: Partial<OpcoesConferencia> = {}): OpcoesConferencia => ({
  existentes: [],
  especialidades: ESPECIALIDADES,
  servicos: SERVICOS,
  criarEspecialidades: false,
  ...extra,
});

describe("células de repasse", () => {
  it("em branco é nulo e zero é zero — nunca a mesma coisa", () => {
    expect(numeroOuNulo("")).toBeNull();
    expect(numeroOuNulo(null)).toBeNull();
    expect(numeroOuNulo("   ")).toBeNull();
    expect(numeroOuNulo("0")).toBe(0);
    expect(numeroOuNulo(0)).toBe(0);
    expect(numeroOuNulo("0,00")).toBe(0);
  });

  it("aceita percentual, reais e formato brasileiro", () => {
    expect(numeroOuNulo("60%")).toBe(60);
    expect(numeroOuNulo("R$ 1.234,56")).toBe(1234.56);
    expect(numeroOuNulo("70,5")).toBe(70.5);
    expect(numeroOuNulo(45)).toBe(45);
    expect(Number.isNaN(numeroOuNulo("sessenta"))).toBe(true);
  });

  it("tipo de repasse reconhece as grafias comuns", () => {
    expect(normalizarTipoRepasse("Percentual")).toBe("percentual");
    expect(normalizarTipoRepasse("%")).toBe("percentual");
    expect(normalizarTipoRepasse("60%")).toBe("percentual");
    expect(normalizarTipoRepasse("VALOR")).toBe("valor");
    expect(normalizarTipoRepasse("Valor fixo")).toBe("valor");
    expect(normalizarTipoRepasse("R$ 70")).toBe("valor");
    expect(normalizarTipoRepasse("")).toBeNull();
    expect(normalizarTipoRepasse("70")).toBeNull();
  });
});

describe("limpeza de cadastro", () => {
  it("CPF ganha máscara, recupera zero à esquerda e recusa tamanho errado", () => {
    expect(normalizarCpf("12345678909")).toBe("123.456.789-09");
    expect(normalizarCpf(1234567890)).toBe("012.345.678-90");
    expect(normalizarCpf("123.456.789-09")).toBe("123.456.789-09");
    expect(normalizarCpf("")).toBeNull();
    expect(normalizarCpf("123456789012")).toBe("");
  });

  it("CRM compara sem pontuação nem zero à esquerda", () => {
    expect(chaveCrm("52.111.111-1", "rj")).toBe(chaveCrm("521111111", "RJ"));
    expect(chaveCrm("0123", "SP")).toBe("123|SP");
    expect(chaveCrm("", "RJ")).toBe("");
  });

  it("especialidades separadas por ponto e vírgula, sem repetição", () => {
    expect(separarEspecialidades("Cardiologia; clínica médica / CARDIOLOGIA")).toEqual([
      "CARDIOLOGIA",
      "CLÍNICA MÉDICA",
    ]);
  });
});

describe("leitura da planilha", () => {
  it("lê as duas abas e limpa o nome do médico", async () => {
    const lida = await lerPlanilhaMedicos(
      arquivo({
        [ABA_MEDICOS]: [CABECALHO_MEDICOS, linhaMedico({ ...MEDICO_OK, CPF: "12345678909" })],
        [ABA_REPASSES]: [
          CABECALHO_REPASSES,
          linhaRepasse({ Médico: "Carlos Lima", Serviço: "Consulta Cardiologia" }),
        ],
      }),
    );
    expect(lida.recusadas).toEqual([]);
    expect(lida.medicos).toHaveLength(1);
    const m = lida.medicos[0];
    expect(m.nome).toBe("CARLOS LIMA");
    expect(m.crm).toBe("52111111-1");
    expect(m.crmUf).toBe("RJ");
    expect(m.tipoRepasse).toBe("percentual");
    expect(m.repassePadrao).toBe(60);
    expect(m.cpf).toBe("123.456.789-09");
    expect(m.aceitaCartaoBeneficios).toBe(true);
    expect(m.duracaoConsultaMin).toBe(15);
    expect(m.linhaExcel).toBe(2);
    expect(lida.repasses).toHaveLength(1);
    expect(lida.repasses[0].particular).toBeNull();
  });

  it("lê CSV com ponto e vírgula, decimal com vírgula e acento do Excel (Windows-1252)", async () => {
    const texto =
      "Nome;CRM;UF do CRM;Especialidades;Tipo de Repasse;Repasse Padrão;CPF;Telefone\r\n" +
      "Dr. João Lima;52111111-1;RJ;Cardiologia;Percentual;60,5;01234567890;(21) 99999-0000\r\n";
    // Windows-1252: um byte por caractere (é, ã, ç ficam abaixo de 0x100).
    const bytes = Uint8Array.from(texto, (c) => c.charCodeAt(0));
    const lida = await lerPlanilhaMedicos(bytes.buffer, "medicos.csv");
    expect(lida.recusadas).toEqual([]);
    expect(lida.medicos).toHaveLength(1);
    expect(lida.medicos[0].nome).toBe("JOÃO LIMA");
    expect(lida.medicos[0].repassePadrao).toBe(60.5);
    expect(lida.medicos[0].cpf).toBe("012.345.678-90");
  });

  it("CSV de outro sistema, sem repasse nem UF: usa a UF da clínica e o repasse da tela", async () => {
    const texto =
      "Nome,DATA DE NASCIMENTO,CPF/CNPJ,CRM,Pasta,Especialidades,TELEFONE\n" +
      "ANA LIMA,25/02/79,057.820.277-89,52804746,98712,PISCOLOGIA,(21) 99146-6993 / (21) 97024-1174\n" +
      'LUCIANA MENEZES,26/04/79,,"5278651-9/RJ / RQE N.: 15256",1,DERMARTOLOGIA,21 97622-3353\n' +
      "JOSE SOUZA,,,5274391-7/R,2,NUTRICIONISTA,21 99816-5690\n";
    const lida = await lerPlanilhaMedicos(
      new TextEncoder().encode(texto).buffer as ArrayBuffer,
      "medicos.csv",
      { ufPadrao: "RJ" },
    );
    expect(lida.semRepasse).toBe(true);
    expect(lida.recusadas).toEqual([]);
    const [ana, luciana, jose] = lida.medicos;
    expect(ana.crmUf).toBe("RJ");
    expect(ana.dataNascimento).toBe("1979-02-25");
    expect(ana.telefone2).toBe("(21) 97024-1174");
    expect(ana.repassePadrao).toBeNull();
    expect(luciana.crm).toBe("5278651-9");
    expect(luciana.rqe).toBe("15256");
    expect(jose.crm).toBe("5274391-7");

    const especialidades = [
      { id: "psi", nome: "PSICOLOGIA" },
      { id: "derm", nome: "DERMATOLOGIA" },
      { id: "nut", nome: "NUTRICAO" },
    ];
    const base = { existentes: [], especialidades, servicos: [], criarEspecialidades: false };
    // Sem o repasse da tela, ninguém é cadastrado: o sistema não supõe valor.
    expect(conferirImportacaoMedicos(lida, base).novos).toHaveLength(0);

    const c = conferirImportacaoMedicos(lida, {
      ...base,
      repasseGeral: { tipo: "percentual", valor: 60 },
    });
    expect(c.novos).toHaveLength(3);
    expect(c.novos[0].repassePadrao).toBe(60);
    expect(c.novos[0].repasseDaTela).toBe(true);
    expect(c.novos.map((m) => m.especialidadesResolvidas[0].id)).toEqual(["psi", "derm", "nut"]);
    expect(c.especialidadesFaltando).toEqual([]);
  });

  it("não troca especialidade de nome curto nem parecida com duas", () => {
    const cadastro = [
      { id: "uro", nome: "UROLOGIA" },
      { id: "neuro", nome: "NEUROLOGIA" },
    ];
    expect(resolverEspecialidade("NEUROLOGIA", cadastro)?.id).toBe("neuro");
    expect(resolverEspecialidade("NEROLOGIA", cadastro)?.id).toBe("neuro");
    expect(resolverEspecialidade("NEUROLOGA", cadastro)?.id).toBe("neuro");
    // Nome curto não é corrigido: erro de uma letra ali muda a especialidade.
    expect(resolverEspecialidade("UROLOGA", cadastro)).toBeNull();
    expect(resolverEspecialidade("ESTÉTICA", cadastro)).toBeNull();
  });

  it("lê CSV com vírgula e aspas em UTF-8", async () => {
    const texto =
      "﻿Nome,CRM,UF do CRM,Especialidades,Tipo de Repasse,Repasse Padrão,Telefone\n" +
      'Dr. Carlos Lima,52111111-1,RJ,"Cardiologia, Clínica Médica",Valor,"70,00",(21) 99999-0000\n';
    const bytes = new TextEncoder().encode(texto);
    const lida = await lerPlanilhaMedicos(bytes.buffer as ArrayBuffer, "medicos.csv");
    expect(lida.recusadas).toEqual([]);
    expect(lida.medicos).toHaveLength(1);
    expect(lida.medicos[0].tipoRepasse).toBe("valor");
    expect(lida.medicos[0].repassePadrao).toBe(70);
  });

  it("repasse padrão em branco é recusado; 0 digitado é aceito", async () => {
    const lida = await lerPlanilhaMedicos(
      arquivo({
        [ABA_MEDICOS]: [
          CABECALHO_MEDICOS,
          linhaMedico({ ...MEDICO_OK, "Repasse Padrão": "" }),
          linhaMedico({ ...MEDICO_OK, CRM: "999", "Repasse Padrão": "0" }),
        ],
      }),
    );
    expect(lida.recusadas).toHaveLength(1);
    expect(lida.recusadas[0].linhaExcel).toBe(2);
    expect(lida.recusadas[0].motivo).toContain("em branco");
    expect(lida.medicos).toHaveLength(1);
    expect(lida.medicos[0].repassePadrao).toBe(0);
  });

  it("recusa repasse inválido; falta de UF e especialidade entra como pendência", async () => {
    const lida = await lerPlanilhaMedicos(
      arquivo({
        [ABA_MEDICOS]: [
          CABECALHO_MEDICOS,
          linhaMedico({ ...MEDICO_OK, "Repasse Padrão": "120" }),
          linhaMedico({ ...MEDICO_OK, CRM: "2", "UF do CRM": "" }),
          linhaMedico({ ...MEDICO_OK, CRM: "3", Especialidades: "" }),
          linhaMedico({ ...MEDICO_OK, CRM: "4", "Tipo de Repasse": "", "Repasse Padrão": "70" }),
        ],
      }),
    );
    expect(lida.recusadas.map((r) => r.linhaExcel)).toEqual([2, 5]);
    expect(lida.medicos.map((m) => m.pendencias)).toEqual([
      ["sem UF do CRM"],
      ["sem especialidade"],
    ]);
  });

  it("médico sem telefone, sem CRM ou com CPF inválido entra com pendência", async () => {
    const lida = await lerPlanilhaMedicos(
      arquivo({
        [ABA_MEDICOS]: [
          CABECALHO_MEDICOS,
          linhaMedico({ ...MEDICO_OK, Telefone: "" }),
          linhaMedico({ ...MEDICO_OK, CRM: "2", Telefone: "9999-0000" }),
          linhaMedico({ ...MEDICO_OK, CRM: "3", Telefone: 21999990000 }),
          linhaMedico({ ...MEDICO_OK, CRM: "", CPF: "123" + "45" }),
          linhaMedico({ ...MEDICO_OK, CRM: "", CPF: "123456789012" }),
        ],
      }),
    );
    expect(lida.recusadas).toEqual([]);
    expect(lida.medicos.map((m) => m.pendencias)).toEqual([
      ["sem telefone"],
      ["sem telefone"],
      [],
      ["sem CRM"],
      ["sem CRM", 'CPF inválido na planilha ("123456789012")'],
    ]);
    expect(lida.medicos[2].telefone).toBe("21999990000");
    // CRM provisório único por linha: o banco não aceita dois iguais na clínica.
    expect(lida.medicos[3].crm).toBe("PENDENTE 5");
    expect(lida.medicos[4].crm).toBe("PENDENTE 6");
    expect(lida.medicos[4].cpf).toBeNull();
  });

  it("aceita a UF grudada no CRM e deduz o tipo pelo símbolo", async () => {
    const lida = await lerPlanilhaMedicos(
      arquivo({
        [ABA_MEDICOS]: [
          CABECALHO_MEDICOS,
          linhaMedico({
            ...MEDICO_OK,
            CRM: "52111111-1/RJ",
            "UF do CRM": "",
            "Tipo de Repasse": "",
            "Repasse Padrão": "R$ 80,00",
          }),
        ],
      }),
    );
    expect(lida.recusadas).toEqual([]);
    expect(lida.medicos[0].crm).toBe("52111111-1");
    expect(lida.medicos[0].crmUf).toBe("RJ");
    expect(lida.medicos[0].tipoRepasse).toBe("valor");
    expect(lida.medicos[0].repassePadrao).toBe(80);
  });

  it("CRM repetido na própria planilha fica só a primeira linha", async () => {
    const lida = await lerPlanilhaMedicos(
      arquivo({
        [ABA_MEDICOS]: [
          CABECALHO_MEDICOS,
          linhaMedico(MEDICO_OK),
          linhaMedico({ ...MEDICO_OK, Nome: "Outro Nome", CRM: "52.111.111-1" }),
        ],
      }),
    );
    expect(lida.medicos).toHaveLength(1);
    expect(lida.recusadas[0].motivo).toContain("linha 2");
  });

  it("linha em branco no meio não desalinha o número da linha", async () => {
    const lida = await lerPlanilhaMedicos(
      arquivo({
        [ABA_MEDICOS]: [
          ["PLANILHA DA SÃO FRANCISCO"],
          [],
          CABECALHO_MEDICOS,
          linhaMedico(MEDICO_OK),
          [],
          linhaMedico({ ...MEDICO_OK, CRM: "2", "Repasse Padrão": "abc" }),
        ],
      }),
    );
    expect(lida.medicos[0].linhaExcel).toBe(4);
    expect(lida.recusadas[0].linhaExcel).toBe(6);
  });

  it("recusa as linhas de exemplo do modelo", async () => {
    const XLSXmod = await import("xlsx");
    const wb = montarModeloMedicos(XLSXmod);
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const lida = await lerPlanilhaMedicos(buf);
    expect(lida.abaMedicos).toBe(ABA_MEDICOS);
    expect(lida.abaRepasses).toBe(ABA_REPASSES);
    expect(lida.medicos).toHaveLength(0);
    expect(lida.repasses).toHaveLength(0);
    expect(lida.recusadas.every((r) => r.motivo.includes("exemplo"))).toBe(true);
    expect(lida.recusadas).toHaveLength(5);
  });

  it("o modelo, sem a marca de exemplo, é lido sem nenhum erro", async () => {
    const XLSXmod = await import("xlsx");
    const wb = montarModeloMedicos(XLSXmod, {
      especialidades: ["CARDIOLOGIA"],
      servicos: ["CONSULTA CARDIOLOGIA"],
    });
    for (const nomeAba of [ABA_MEDICOS, ABA_REPASSES]) {
      const aba = wb.Sheets[nomeAba];
      for (const k of Object.keys(aba)) {
        const cel = aba[k] as { v?: unknown };
        if (typeof cel?.v === "string") cel.v = cel.v.replace(" (EXEMPLO)", "");
      }
    }
    expect(wb.SheetNames).toEqual([
      "LEIA-ME",
      ABA_MEDICOS,
      ABA_REPASSES,
      "Especialidades",
      "Serviços da clínica",
    ]);
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const lida = await lerPlanilhaMedicos(buf);
    expect(lida.recusadas).toEqual([]);
    expect(lida.medicos).toHaveLength(2);
    expect(lida.medicos[1].especialidades).toEqual(["ULTRASSONOGRAFIA", "GINECOLOGIA"]);
    expect(lida.medicos[1].tipoRepasse).toBe("valor");
    expect(lida.medicos[1].repassePadrao).toBe(70);
    expect(lida.repasses).toHaveLength(3);
    expect(lida.repasses[2].cartaoConsulta).toBe(0);
    expect(lida.repasses[2].particular).toBeNull();
  });
});

describe("conferência com a clínica", () => {
  async function ler(medicos: Celula[][], repasses: Celula[][] = []) {
    return lerPlanilhaMedicos(
      arquivo({
        [ABA_MEDICOS]: [CABECALHO_MEDICOS, ...medicos],
        [ABA_REPASSES]: [CABECALHO_REPASSES, ...repasses],
      }),
    );
  }

  it("pula médico que já existe por CRM, CPF ou nome — nunca duplica", async () => {
    const lida = await ler([
      linhaMedico(MEDICO_OK),
      linhaMedico({ ...MEDICO_OK, Nome: "Ana Paula", CRM: "2", CPF: "12345678909" }),
      linhaMedico({ ...MEDICO_OK, Nome: "Dra. Beatriz Costa", CRM: "3" }),
      linhaMedico({ ...MEDICO_OK, Nome: "Novo Médico", CRM: "4" }),
    ]);
    const c = conferirImportacaoMedicos(
      lida,
      opcoes({
        existentes: [
          { id: "a", nome: "OUTRO", crm: "52.111.111-1", crm_uf: "RJ", cpf: null },
          { id: "b", nome: "OUTRA", crm: "X", crm_uf: "SP", cpf: "123.456.789-09" },
          { id: "c", nome: "BEATRIZ COSTA", crm: "Y", crm_uf: "SP", cpf: null },
        ],
      }),
    );
    expect(c.jaCadastrados.map((j) => j.linha.linhaExcel)).toEqual([2, 3, 4]);
    expect(c.novos.map((m) => m.nome)).toEqual(["NOVO MÉDICO"]);
  });

  it("especialidade inexistente bloqueia, a menos que marque para criar", async () => {
    const lida = await ler([
      linhaMedico({ ...MEDICO_OK, Especialidades: "Cardiologia; Angiologia" }),
    ]);

    const sem = conferirImportacaoMedicos(lida, opcoes());
    expect(sem.novos).toHaveLength(0);
    expect(sem.especialidadesFaltando).toEqual(["ANGIOLOGIA"]);
    expect(sem.recusadas[0].motivo).toContain("ANGIOLOGIA");

    const com = conferirImportacaoMedicos(lida, opcoes({ criarEspecialidades: true }));
    expect(com.novos).toHaveLength(1);
    expect(com.novos[0].especialidadesResolvidas).toEqual([
      { nome: "CARDIOLOGIA", id: "esp-cardio" },
      { nome: "ANGIOLOGIA", id: null },
    ]);
  });

  it("liga o repasse ao serviço do catálogo e herda o tipo do padrão", async () => {
    const lida = await ler(
      [linhaMedico({ ...MEDICO_OK, "Tipo de Repasse": "Valor", "Repasse Padrão": "70" })],
      [
        linhaRepasse({ Médico: "carlos lima", Serviço: "consulta cardiologia" }),
        linhaRepasse({
          Médico: "Carlos Lima",
          Serviço: "Eletrocardiograma",
          "Repasse Particular": "40",
          "Repasse Cartão Consulta (R$)": "0",
        }),
      ],
    );
    const c = conferirImportacaoMedicos(lida, opcoes());
    expect(c.recusadas).toEqual([]);
    const [consulta, ecg] = c.novos[0].repasses;
    expect(consulta.procedimentoNome).toBe("CONSULTA CARDIOLOGIA");
    expect(repasseTemExcecao(consulta)).toBe(false);
    expect(ecg.procedimentoId).toBe("srv-ecg");
    expect(ecg.tipoEfetivo).toBe("valor");
    expect(ecg.particular).toBe(40);
    expect(ecg.convenio).toBeNull();
    expect(ecg.cartaoConsulta).toBe(0);
    expect(repasseTemExcecao(ecg)).toBe(true);
  });

  it("recusa serviço fora do catálogo, médico ausente, já cadastrado e repetição", async () => {
    const lida = await ler(
      [linhaMedico(MEDICO_OK), linhaMedico({ ...MEDICO_OK, Nome: "Já Existe", CRM: "9" })],
      [
        linhaRepasse({ Médico: "Carlos Lima", Serviço: "Ressonância" }),
        linhaRepasse({ Médico: "Fulano", Serviço: "Eletrocardiograma" }),
        linhaRepasse({ Médico: "Já Existe", Serviço: "Eletrocardiograma" }),
        linhaRepasse({ Médico: "Carlos Lima", Serviço: "Eletrocardiograma" }),
        linhaRepasse({
          Médico: "Carlos Lima",
          Serviço: "ELETROCARDIOGRAMA",
          "Repasse Particular": "1",
        }),
      ],
    );
    const c = conferirImportacaoMedicos(
      lida,
      opcoes({ existentes: [{ id: "x", nome: "JA EXISTE", crm: "Z", crm_uf: "MG", cpf: null }] }),
    );
    const motivos = c.recusadas.map((r) => `${r.linhaExcel}: ${r.motivo}`);
    expect(motivos[0]).toContain("2: Este serviço não existe");
    expect(motivos[1]).toContain("3: Este médico não aparece");
    expect(motivos[2]).toContain("4: Este médico já estava cadastrado");
    expect(motivos[3]).toContain("6: Este serviço já aparece");
    expect(c.novos[0].repasses).toHaveLength(1);
  });

  it("homônimos na planilha exigem CRM na aba de repasse", async () => {
    const lida = await ler(
      [linhaMedico(MEDICO_OK), linhaMedico({ ...MEDICO_OK, CRM: "777" })],
      [
        linhaRepasse({ Médico: "Carlos Lima", Serviço: "Eletrocardiograma" }),
        linhaRepasse({ Médico: "Carlos Lima", CRM: "777", Serviço: "Eletrocardiograma" }),
      ],
    );
    const c = conferirImportacaoMedicos(lida, opcoes());
    expect(c.recusadas).toHaveLength(1);
    expect(c.recusadas[0].motivo).toContain("Preencha a coluna CRM");
    expect(c.novos.find((m) => m.crm === "777")?.repasses).toHaveLength(1);
  });
});

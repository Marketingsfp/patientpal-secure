
## Resumo

A planilha tem 1.015 linhas (Especialidade, Categoria, Serviço, Médico) para a clínica **POLICLINICA MENINO JESUS**. Cruzei tudo com o banco:

- **Especialidades**: todas as 19 já cadastradas. Nada a criar aqui.
- **Médicos**: 34 nomes não batem exatamente. **30 deles batem com cadastros existentes** (a planilha usa nome curto; o banco tem nome completo). **4 parecem realmente faltar**.
- **Serviços (procedimentos)**: 33 nomes únicos não existem no banco para a especialidade/tipo correspondente (70 linhas da planilha).
- **Vínculos já existentes**: 24.
- **Vínculos novos a criar (após resolver pendências)**: **676** linhas em `medico_procedimentos`.

## O que será feito automaticamente

Para cada linha da planilha onde já encontro médico + serviço no banco, criar o vínculo em `public.medico_procedimentos` (1 único `INSERT ... ON CONFLICT DO NOTHING`). Médicos com correspondência forte por nome (subset/prefixo) entram aqui:

| Planilha | Cadastrado no banco como |
|---|---|
| Dr. Alexandre Figueiredo de Queiroz | ALEXANDRE DE FIGUEIREDO QUEIROZ |
| Dr. Antonio Cobucci | ANTONIO CARLOS SIQUEIRA COBUCCI |
| Dr. Armando José | ARMANDO JOSE DA SILVA JUNIOR |
| Dr. Carlos Alberto Varillas | CARLOS ALBERTO OLIVERO VARILLAS |
| Dr. Carlos Eduardo | CARLOS EDUARDO GONCALVES MONTEIRO |
| Dr. Eugenio Cesar | EUGENIO CESAR SOLON CAPOBIANCO |
| Dr. Felipe Moura | FELIPE MOURA CORREA |
| Dr. José Roberto | JOSE ROBERTO PINTO BARBOSA |
| Dr. Marcílio Quintão | MARCILIO QUINTAO DE SOUZA |
| Dr. Mauricio Albuquerque | MAURICIO ALBUQUERQUE DE PAULA |
| Dr. Milton Pires | MILTON PIRES GUIMARAES |
| Dr. Paulo Guilherme | PAULO GUILHERME NADER DAMASCENO |
| Dr. Paulo Roberto | PAULO ROBERTO L MONTEIRO |
| Dr. Samuel Jose Souza Machado | SAMUEL JOSE |
| Dr. Sérgio Mendes | SERGIO MENDES MANOEL |
| Dr. Sérgio Pallermo | SERGIO ANTONIO PALERMO DE ALMEIDA |
| Dra. Adriana Cristhian Cardoso | ADRIANA CRISTHIAN CARDOSO SOBRINHO |
| Dra. Aline Ferreira | ALINE DE ANDRADE FERREIRA |
| Dra. Barbara de Oliveira Soriano | BARBARA OLIVEIRA |
| Dra. Claudia Maria | CLAUDIA MARIA RODRIGUES DOS SANTOS |
| Dra. Conceição | CONCEICAO DA SILVA MARTINS |
| Dra. Elair Magalhães | ELAIR DE MAGALHAES ALVES NUNES |
| Dra. Eliane Cristina Alves | ELIANE CRISTINA ALVES SOUZA |
| Dra. Eneida de Oliveira | ENEIDA DE OLIVEIRA RODRIGUES |
| Dra. Iarmila Ruzena | IARMILA RUZENA KRASNY |
| Dra. Karina Ruiz | KARINA RUIZ CARDOSO DE OLIVEIRA |
| Dra. Maria da Penha Condado | MARIA DA PENHA CONDADO TANUS TAYAR |
| Dra. Priscila Ana Braga da Silva | PRISCILA ANA BRAGA DA SILVA ROCHA |
| Dra. Roberta Corredeira | ROBERTA DA FONSECA CORREDEIRA |
| Dra. Valéria Silveira | VALERIA SILVEIRA LIMA TEIXEIRA |

**Atenção — preciso da sua confirmação antes de incluir/excluir estes:**

- **Dr. Marcelo Barreto Franco de Oliveira** (planilha) × **MARCELO BARRETO FRANCO DA SILVEIRA** (banco) — sobrenome diferente. É a mesma pessoa (planilha errada no sobrenome) ou são pessoas diferentes?
- **Dr. Rafael Soares** — não tem cadastro parecido. Cadastrar depois?
- **Dr. Adrian Andres Jara Benitez** — não tem cadastro. Cadastrar depois?
- **Dr. Sandro da Silva Princeswal** — não tem cadastro. Cadastrar depois?

## Pendências para você cadastrar depois

### Médicos a cadastrar (4)
- Dr. Adrian Andres Jara Benitez (Urologia)
- Dr. Rafael Soares (verificar especialidade na planilha)
- Dr. Sandro da Silva Princeswal
- Dr. Marcelo Barreto Franco de Oliveira *(se confirmar que é diferente do "da Silveira")*

### Serviços a cadastrar (33 únicos)

**Angiologia / Procedimento**
- APLICAÇÃO EM VARIZES (Dr. André Luis Lima da Silva)

**Cardiologia**
- CARDIOLOGIA — Consulta (Dr. Alex Louza Macedo, Dr. Rosangela Schmitz Riolino) — *obs.: já existe "CONSULTA" em Cardiologia; talvez seja redundância*
- ECOCARDIOGRAMA — Exame (Dr. Rosangela Schmitz Riolino)

**Fisioterapia / Procedimento** (todos com Dra. Daiane Helena de Almeida)
- 5 SESSÕES DE FISIOTERAPIA
- 5 SESSÕES DE FISIOTERAPIA INFANTIL
- 5 SESSÕES DE FISIOTERAPIA OCULAR
- 5 SESSÕES DE FISIOTERAPIA PÉLVICA
- 5 SESSÕES DE FISIOTERAPIA RESPIRATÓRIA
- 5 SESSÕES DE FISIOTERAPIA VESTIBULAR
- 5 SESSÕES DE RPG

**Neurologia / Procedimento**
- LAUDO (Dr. Anderson Luis Eloy Amaral)

**Odontologia / Procedimento** (Dr. Jean, Dr. Thiago, Dra. Karen, Dra. Raiani)
- CIRURGIA DE IMPLANTE INDIVIDUAL COM COROA
- CIRURGIA DE IMPLANTE SÓ CIRURGIA
- DRENAGEM DE ABCESSO
- IMPLANTE UNITÁRIO
- LAUDO
- MANUTENÇÃO APARELHO DE METAL
- RETRATMENTO DE CANAL
- ULOTOMIA (INCISÃO CIRURGICA)
- VERNIZ POR SESSÃO

**Oftalmologia** (Dr. João Hélio)
- OCT (categoria em branco na planilha)
- Exames: CAMPO VISUAL COMPUTADORIZADO, CAPSULOTOMIA COM YAG LASER, CURVA TENSIONAL/CURVA DE PIO/TESTE DE SOBRECARGA HÍDRICA, ECOBIOMETRIA, IRIDOTOMIA COM YAG LASER, MEC - MICROSCOPIA ESPECULAR DE CÓRNEAS, PAM, TOMOGRAFIA DE CORNEAS (GALILEI), TOPOGRAFIA DE CORNEAS, ULTRASSONOGRAFIA OCULAR
- LAUDO — Procedimento

**Ortopedia / Procedimento**
- LAUDO (Dr. Jorge Ribeiro)

## Perguntas antes de executar

1. **Dr. Marcelo Barreto Franco de Oliveira** = **MARCELO BARRETO FRANCO DA SILVEIRA**? (sim/não)
2. Os 3 médicos sem nenhum cadastro (Adrian, Rafael Soares, Sandro Princeswal) eu deixo só na lista de pendências, certo? Não cadastro automático.
3. Os 33 serviços faltantes eu deixo só na lista de pendências para você cadastrar manualmente (em vez de eu criar tudo)?

Assim que você responder, executo um único `INSERT` criando os **676 vínculos** (idempotente, com `ON CONFLICT DO NOTHING`).

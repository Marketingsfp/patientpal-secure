// ============================================
// VALIDAÇÃO DE CPF
// ============================================

/**
 * Remove máscara e caracteres especiais do CPF
 */
export function limparCPF(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

/**
 * Aplica máscara de CPF: 000.000.000-00
 */
export function mascaraCPF(cpf: string): string {
  let valor = limparCPF(cpf);
  
  // Limita a 11 caracteres
  valor = valor.slice(0, 11);
  
  // Aplica a máscara
  if (valor.length <= 3) {
    return valor;
  } else if (valor.length <= 6) {
    return `${valor.slice(0, 3)}.${valor.slice(3)}`;
  } else if (valor.length <= 9) {
    return `${valor.slice(0, 3)}.${valor.slice(3, 6)}.${valor.slice(6)}`;
  } else {
    return `${valor.slice(0, 3)}.${valor.slice(3, 6)}.${valor.slice(6, 9)}-${valor.slice(9, 11)}`;
  }
}

/**
 * Valida CPF usando o algoritmo oficial (dígitos verificadores)
 */
export function validarCPF(cpf: string): { valido: boolean; mensagem: string; cpfLimpo?: string } {
  const cpfLimpo = limparCPF(cpf);
  
  // Verifica tamanho máximo
  if (cpfLimpo.length > 11) {
    return { valido: false, mensagem: "CPF deve ter no máximo 11 dígitos" };
  }
  
  // Verifica se tem 11 dígitos
  if (cpfLimpo.length !== 11) {
    return { valido: false, mensagem: "CPF deve ter exatamente 11 dígitos" };
  }
  
  // Verifica se todos os dígitos são iguais (ex: 111.111.111-11)
  if (/^(\d)\1{10}$/.test(cpfLimpo)) {
    return { valido: false, mensagem: "CPF inválido (dígitos repetidos)" };
  }
  
  // Validação do primeiro dígito verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpfLimpo.charAt(i)) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  const digito1 = resto >= 10 ? 0 : resto;
  
  // Validação do segundo dígito verificador
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpfLimpo.charAt(i)) * (11 - i);
  }
  resto = 11 - (soma % 11);
  const digito2 = resto >= 10 ? 0 : resto;
  
  // Verifica se os dígitos calculados batem com os informados
  if (parseInt(cpfLimpo.charAt(9)) !== digito1 || parseInt(cpfLimpo.charAt(10)) !== digito2) {
    return { valido: false, mensagem: "CPF inválido (dígitos verificadores não conferem)" };
  }
  
  return { 
    valido: true, 
    mensagem: "CPF válido",
    cpfLimpo
  };
}

// ============================================
// VALIDAÇÃO DE TELEFONE
// ============================================

/**
 * Remove máscara e caracteres especiais do telefone
 */
export function limparTelefone(telefone: string): string {
  return telefone.replace(/\D/g, '');
}

/**
 * Aplica máscara de telefone: (00) 00000-0000 ou (00) 0000-0000
 */
export function mascaraTelefone(telefone: string): string {
  let valor = limparTelefone(telefone);
  
  // Limita a 11 caracteres
  valor = valor.slice(0, 11);
  
  // Aplica a máscara progressivamente
  if (valor.length <= 2) {
    return valor.length === 2 ? `(${valor}` : valor;
  } else if (valor.length <= 6) {
    return `(${valor.slice(0, 2)}) ${valor.slice(2)}`;
  } else if (valor.length <= 10) {
    return `(${valor.slice(0, 2)}) ${valor.slice(2, 6)}-${valor.slice(6)}`;
  } else {
    return `(${valor.slice(0, 2)}) ${valor.slice(2, 7)}-${valor.slice(7, 11)}`;
  }
}

/**
 * Valida telefone (10 ou 11 dígitos, DDD válido)
 */
export function validarTelefone(telefone: string): { valido: boolean; mensagem: string; telefoneLimpo?: string } {
  const telefoneLimpo = limparTelefone(telefone);
  
  // Verifica tamanho (10 ou 11 dígitos)
  if (telefoneLimpo.length < 10 || telefoneLimpo.length > 11) {
    return { 
      valido: false, 
      mensagem: "Telefone deve ter 10 ou 11 dígitos" 
    };
  }
  
  // Verifica DDD (de 11 a 99)
  const ddd = parseInt(telefoneLimpo.slice(0, 2));
  if (ddd < 11 || ddd > 99) {
    return { 
      valido: false, 
      mensagem: "DDD inválido (deve ser entre 11 e 99)" 
    };
  }
  
  // Verifica se o primeiro dígito do número é 9 (celular)
  if (telefoneLimpo.length === 11 && telefoneLimpo.charAt(2) !== '9') {
    return { 
      valido: false, 
      mensagem: "Celular com 11 dígitos deve começar com 9" 
    };
  }
  
  return { 
    valido: true, 
    mensagem: "Telefone válido",
    telefoneLimpo
  };
}

// ============================================
// FUNÇÃO COMBINADA PARA FORMULÁRIO
// ============================================

export interface DadosPaciente {
  nome: string;
  cpf: string;
  telefone: string;
}

export interface ValidacaoPaciente {
  nomeValido: boolean;
  cpfValido: boolean;
  telefoneValido: boolean;
  cpfFormatado?: string;
  telefoneFormatado?: string;
  mensagens: string[];
}

export function validarDadosPaciente(dados: DadosPaciente): ValidacaoPaciente {
  const mensagens: string[] = [];
  
  // Valida nome
  const nomeValido = dados.nome.trim().length >= 2;
  if (!nomeValido) {
    mensagens.push("Nome deve ter pelo menos 2 caracteres");
  }
  
  // Valida CPF (se preenchido)
  let cpfValido = true;
  let cpfFormatado;
  if (dados.cpf.trim().length > 0) {
    const result = validarCPF(dados.cpf);
    cpfValido = result.valido;
    if (!cpfValido) {
      mensagens.push(result.mensagem);
    } else {
      cpfFormatado = mascaraCPF(dados.cpf);
    }
  }
  
  // Valida Telefone (se preenchido)
  let telefoneValido = true;
  let telefoneFormatado;
  if (dados.telefone.trim().length > 0) {
    const result = validarTelefone(dados.telefone);
    telefoneValido = result.valido;
    if (!telefoneValido) {
      mensagens.push(result.mensagem);
    } else {
      telefoneFormatado = mascaraTelefone(dados.telefone);
    }
  }
  
  return {
    nomeValido,
    cpfValido,
    telefoneValido,
    cpfFormatado,
    telefoneFormatado,
    mensagens
  };
}
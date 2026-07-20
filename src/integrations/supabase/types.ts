export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _mj_dedup: {
        Row: {
          bairro: string | null
          cep: string | null
          chave: string | null
          cidade: string | null
          codigo_pessoa: string | null
          complemento: string | null
          cpf_cnpj: string | null
          cpf_digits: string | null
          ddd_1: string | null
          ddd_2: string | null
          email: string | null
          endereco: string | null
          fone_1: string | null
          fone_2: string | null
          nascimento_abertura: string | null
          nome: string | null
          nome_u: string | null
          numero: string | null
          sexo: string | null
          uf: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          chave?: string | null
          cidade?: string | null
          codigo_pessoa?: string | null
          complemento?: string | null
          cpf_cnpj?: string | null
          cpf_digits?: string | null
          ddd_1?: string | null
          ddd_2?: string | null
          email?: string | null
          endereco?: string | null
          fone_1?: string | null
          fone_2?: string | null
          nascimento_abertura?: string | null
          nome?: string | null
          nome_u?: string | null
          numero?: string | null
          sexo?: string | null
          uf?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          chave?: string | null
          cidade?: string | null
          codigo_pessoa?: string | null
          complemento?: string | null
          cpf_cnpj?: string | null
          cpf_digits?: string | null
          ddd_1?: string | null
          ddd_2?: string | null
          email?: string | null
          endereco?: string | null
          fone_1?: string | null
          fone_2?: string | null
          nascimento_abertura?: string | null
          nome?: string | null
          nome_u?: string | null
          numero?: string | null
          sexo?: string | null
          uf?: string | null
        }
        Relationships: []
      }
      _mj_import_csv: {
        Row: {
          ativo: string | null
          bairro: string | null
          cep: string | null
          chave: string | null
          cidade: string | null
          codigo_especialidade: string | null
          codigo_pessoa: string | null
          complemento: string | null
          cpf_cnpj: string | null
          crm_cro: string | null
          data_cadastro: string | null
          ddd_1: string | null
          ddd_2: string | null
          email: string | null
          endereco: string | null
          estado_civil: string | null
          fone_1: string | null
          fone_2: string | null
          nascimento_abertura: string | null
          nome: string | null
          nome_mae: string | null
          nome_pai: string | null
          numero: string | null
          pessoa_cliente: string | null
          pessoa_profissional: string | null
          pessoa_usuario: string | null
          profissao: string | null
          profissional_cor: string | null
          rg_ie: string | null
          sexo: string | null
          uf: string | null
        }
        Insert: {
          ativo?: string | null
          bairro?: string | null
          cep?: string | null
          chave?: string | null
          cidade?: string | null
          codigo_especialidade?: string | null
          codigo_pessoa?: string | null
          complemento?: string | null
          cpf_cnpj?: string | null
          crm_cro?: string | null
          data_cadastro?: string | null
          ddd_1?: string | null
          ddd_2?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: string | null
          fone_1?: string | null
          fone_2?: string | null
          nascimento_abertura?: string | null
          nome?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          numero?: string | null
          pessoa_cliente?: string | null
          pessoa_profissional?: string | null
          pessoa_usuario?: string | null
          profissao?: string | null
          profissional_cor?: string | null
          rg_ie?: string | null
          sexo?: string | null
          uf?: string | null
        }
        Update: {
          ativo?: string | null
          bairro?: string | null
          cep?: string | null
          chave?: string | null
          cidade?: string | null
          codigo_especialidade?: string | null
          codigo_pessoa?: string | null
          complemento?: string | null
          cpf_cnpj?: string | null
          crm_cro?: string | null
          data_cadastro?: string | null
          ddd_1?: string | null
          ddd_2?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: string | null
          fone_1?: string | null
          fone_2?: string | null
          nascimento_abertura?: string | null
          nome?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          numero?: string | null
          pessoa_cliente?: string | null
          pessoa_profissional?: string | null
          pessoa_usuario?: string | null
          profissao?: string | null
          profissional_cor?: string | null
          rg_ie?: string | null
          sexo?: string | null
          uf?: string | null
        }
        Relationships: []
      }
      _mj_match_plan: {
        Row: {
          chave: string
          pid: string | null
          processed: boolean
          source: string | null
        }
        Insert: {
          chave: string
          pid?: string | null
          processed?: boolean
          source?: string | null
        }
        Update: {
          chave?: string
          pid?: string | null
          processed?: boolean
          source?: string | null
        }
        Relationships: []
      }
      _tmp_import_pacientes: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          codigo_prontuario_anterior: string | null
          complemento: string | null
          cpf: string | null
          data_nascimento: string | null
          email: string | null
          estado: string | null
          logradouro: string | null
          nome: string | null
          numero: string | null
          sexo: string | null
          telefone: string | null
          telefone2: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          codigo_prontuario_anterior?: string | null
          complemento?: string | null
          cpf?: string | null
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          logradouro?: string | null
          nome?: string | null
          numero?: string | null
          sexo?: string | null
          telefone?: string | null
          telefone2?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          codigo_prontuario_anterior?: string | null
          complemento?: string | null
          cpf?: string | null
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          logradouro?: string | null
          nome?: string | null
          numero?: string | null
          sexo?: string | null
          telefone?: string | null
          telefone2?: string | null
        }
        Relationships: []
      }
      agendamento_historico_notas: {
        Row: {
          agendamento_id: string
          clinica_id: string
          created_at: string
          id: string
          texto: string
          user_email: string | null
          user_nome: string | null
        }
        Insert: {
          agendamento_id: string
          clinica_id: string
          created_at?: string
          id?: string
          texto: string
          user_email?: string | null
          user_nome?: string | null
        }
        Update: {
          agendamento_id?: string
          clinica_id?: string
          created_at?: string
          id?: string
          texto?: string
          user_email?: string | null
          user_nome?: string | null
        }
        Relationships: []
      }
      agendamento_orcamento_itens: {
        Row: {
          agendamento_id: string
          clinica_id: string
          created_at: string
          id: string
          orcamento_id: string
          orcamento_item_id: string
        }
        Insert: {
          agendamento_id: string
          clinica_id: string
          created_at?: string
          id?: string
          orcamento_id: string
          orcamento_item_id: string
        }
        Update: {
          agendamento_id?: string
          clinica_id?: string
          created_at?: string
          id?: string
          orcamento_id?: string
          orcamento_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamento_orcamento_itens_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_orcamento_itens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_orcamento_itens_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamento_orcamento_itens_orcamento_item_id_fkey"
            columns: ["orcamento_item_id"]
            isOneToOne: false
            referencedRelation: "orcamento_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      agendamentos: {
        Row: {
          agenda_id: string | null
          atendimento_grupo_id: string | null
          clinica_id: string
          created_at: string
          criado_por: string | null
          data_pagamento: string | null
          especialidade_id: string | null
          executado_em: string | null
          executado_por: string | null
          ficha_numero: number | null
          fim: string
          fluxo_atualizado_em: string
          fluxo_etapa: Database["public"]["Enums"]["fluxo_etapa"]
          forma_pagamento_prevista: string | null
          id: string
          inicio: string
          link_teleconsulta: string | null
          medico_id: string | null
          observacoes: string | null
          orcamento_id: string | null
          orcamento_item_id: string | null
          paciente_id: string | null
          paciente_nome: string
          pacote_id: string | null
          prioridade: Database["public"]["Enums"]["agendamento_prioridade"]
          procedimento: string | null
          status: Database["public"]["Enums"]["agendamento_status"]
          teleconsulta: boolean
          tipo_atendimento: string
          token_publico: string | null
          updated_at: string
        }
        Insert: {
          agenda_id?: string | null
          atendimento_grupo_id?: string | null
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          data_pagamento?: string | null
          especialidade_id?: string | null
          executado_em?: string | null
          executado_por?: string | null
          ficha_numero?: number | null
          fim: string
          fluxo_atualizado_em?: string
          fluxo_etapa?: Database["public"]["Enums"]["fluxo_etapa"]
          forma_pagamento_prevista?: string | null
          id?: string
          inicio: string
          link_teleconsulta?: string | null
          medico_id?: string | null
          observacoes?: string | null
          orcamento_id?: string | null
          orcamento_item_id?: string | null
          paciente_id?: string | null
          paciente_nome: string
          pacote_id?: string | null
          prioridade?: Database["public"]["Enums"]["agendamento_prioridade"]
          procedimento?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          teleconsulta?: boolean
          tipo_atendimento?: string
          token_publico?: string | null
          updated_at?: string
        }
        Update: {
          agenda_id?: string | null
          atendimento_grupo_id?: string | null
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          data_pagamento?: string | null
          especialidade_id?: string | null
          executado_em?: string | null
          executado_por?: string | null
          ficha_numero?: number | null
          fim?: string
          fluxo_atualizado_em?: string
          fluxo_etapa?: Database["public"]["Enums"]["fluxo_etapa"]
          forma_pagamento_prevista?: string | null
          id?: string
          inicio?: string
          link_teleconsulta?: string | null
          medico_id?: string | null
          observacoes?: string | null
          orcamento_id?: string | null
          orcamento_item_id?: string | null
          paciente_id?: string | null
          paciente_nome?: string
          pacote_id?: string | null
          prioridade?: Database["public"]["Enums"]["agendamento_prioridade"]
          procedimento?: string | null
          status?: Database["public"]["Enums"]["agendamento_status"]
          teleconsulta?: boolean
          tipo_atendimento?: string
          token_publico?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "medico_agendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_orcamento_item_id_fkey"
            columns: ["orcamento_item_id"]
            isOneToOne: false
            referencedRelation: "orcamento_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_enfermagem: {
        Row: {
          clinica_id: string
          contatado_em: string | null
          created_at: string
          descricao: string | null
          id: string
          mensagem_sugerida: string | null
          observacao_contato: string | null
          origem: string
          origem_id: string | null
          paciente_id: string | null
          paciente_nome: string | null
          resolvido_em: string | null
          responsavel_id: string | null
          severidade: Database["public"]["Enums"]["resultado_status"]
          status: Database["public"]["Enums"]["alerta_enf_status"]
          titulo: string
          updated_at: string
        }
        Insert: {
          clinica_id: string
          contatado_em?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          mensagem_sugerida?: string | null
          observacao_contato?: string | null
          origem?: string
          origem_id?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          resolvido_em?: string | null
          responsavel_id?: string | null
          severidade?: Database["public"]["Enums"]["resultado_status"]
          status?: Database["public"]["Enums"]["alerta_enf_status"]
          titulo: string
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          contatado_em?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          mensagem_sugerida?: string | null
          observacao_contato?: string | null
          origem?: string
          origem_id?: string | null
          paciente_id?: string | null
          paciente_nome?: string | null
          resolvido_em?: string | null
          responsavel_id?: string | null
          severidade?: Database["public"]["Enums"]["resultado_status"]
          status?: Database["public"]["Enums"]["alerta_enf_status"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_enfermagem_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_enfermagem_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      anamnese_modelos: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          perguntas: Json
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          perguntas?: Json
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          perguntas?: Json
          updated_at?: string
        }
        Relationships: []
      }
      anamnese_respostas: {
        Row: {
          agendamento_id: string | null
          clinica_id: string
          created_at: string
          id: string
          modelo_id: string
          paciente_id: string | null
          respondida_em: string | null
          respostas: Json
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          clinica_id: string
          created_at?: string
          id?: string
          modelo_id: string
          paciente_id?: string | null
          respondida_em?: string | null
          respostas?: Json
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          modelo_id?: string
          paciente_id?: string | null
          respondida_em?: string | null
          respostas?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnese_respostas_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_avaliacoes: {
        Row: {
          clinica_id: string
          comentario: string | null
          conversa_id: string
          created_at: string
          id: string
          nota: number
        }
        Insert: {
          clinica_id: string
          comentario?: string | null
          conversa_id: string
          created_at?: string
          id?: string
          nota: number
        }
        Update: {
          clinica_id?: string
          comentario?: string | null
          conversa_id?: string
          created_at?: string
          id?: string
          nota?: number
        }
        Relationships: [
          {
            foreignKeyName: "atend_avaliacoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_avaliacoes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "atend_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_bot_configs: {
        Row: {
          ai_model: string | null
          ai_prompt: string | null
          ativo: boolean
          bot_type: string
          clinica_id: string
          created_at: string
          departamento_id: string | null
          fallback_departamento_id: string | null
          flow_definition: Json | null
          id: string
          max_ai_interactions: number
          menu_options: Json | null
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          ai_model?: string | null
          ai_prompt?: string | null
          ativo?: boolean
          bot_type?: string
          clinica_id: string
          created_at?: string
          departamento_id?: string | null
          fallback_departamento_id?: string | null
          flow_definition?: Json | null
          id?: string
          max_ai_interactions?: number
          menu_options?: Json | null
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          ai_model?: string | null
          ai_prompt?: string | null
          ativo?: boolean
          bot_type?: string
          clinica_id?: string
          created_at?: string
          departamento_id?: string | null
          fallback_departamento_id?: string | null
          flow_definition?: Json | null
          id?: string
          max_ai_interactions?: number
          menu_options?: Json | null
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atend_bot_configs_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_bot_configs_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "atend_departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_bot_configs_fallback_departamento_id_fkey"
            columns: ["fallback_departamento_id"]
            isOneToOne: false
            referencedRelation: "atend_departamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_conversas: {
        Row: {
          aguardando_desde: string | null
          atribuida_user_id: string | null
          canal: string
          clinica_id: string
          closed_at: string | null
          contato_nome: string | null
          contato_paciente_id: string | null
          contato_telefone: string | null
          created_at: string
          departamento_id: string | null
          fila_posicao: number | null
          id: string
          janela_24h_em: string | null
          primeiro_resp_em: string | null
          protocol_number: string | null
          sentimento: string | null
          sentimento_score: number | null
          sla_first_response_seg: number | null
          status: string
          ultima_msg_em: string
          ultima_msg_preview: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          aguardando_desde?: string | null
          atribuida_user_id?: string | null
          canal?: string
          clinica_id: string
          closed_at?: string | null
          contato_nome?: string | null
          contato_paciente_id?: string | null
          contato_telefone?: string | null
          created_at?: string
          departamento_id?: string | null
          fila_posicao?: number | null
          id?: string
          janela_24h_em?: string | null
          primeiro_resp_em?: string | null
          protocol_number?: string | null
          sentimento?: string | null
          sentimento_score?: number | null
          sla_first_response_seg?: number | null
          status?: string
          ultima_msg_em?: string
          ultima_msg_preview?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          aguardando_desde?: string | null
          atribuida_user_id?: string | null
          canal?: string
          clinica_id?: string
          closed_at?: string | null
          contato_nome?: string | null
          contato_paciente_id?: string | null
          contato_telefone?: string | null
          created_at?: string
          departamento_id?: string | null
          fila_posicao?: number | null
          id?: string
          janela_24h_em?: string | null
          primeiro_resp_em?: string | null
          protocol_number?: string | null
          sentimento?: string | null
          sentimento_score?: number | null
          sla_first_response_seg?: number | null
          status?: string
          ultima_msg_em?: string
          ultima_msg_preview?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_conversas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_conversas_contato_paciente_id_fkey"
            columns: ["contato_paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_conversas_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "atend_departamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_departamento_membros: {
        Row: {
          clinica_id: string
          created_at: string
          departamento_id: string
          id: string
          max_simultaneas: number
          queue_locked: boolean
          role: string
          user_id: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          departamento_id: string
          id?: string
          max_simultaneas?: number
          queue_locked?: boolean
          role?: string
          user_id: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          departamento_id?: string
          id?: string
          max_simultaneas?: number
          queue_locked?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_departamento_membros_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_departamento_membros_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "atend_departamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_departamentos: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          descricao: string | null
          distribuicao: string
          id: string
          nome: string
          prioridade: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          descricao?: string | null
          distribuicao?: string
          id?: string
          nome: string
          prioridade?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          distribuicao?: string
          id?: string
          nome?: string
          prioridade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_departamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_horarios: {
        Row: {
          ativo: boolean
          canal: string
          clinica_id: string
          created_at: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
        }
        Insert: {
          ativo?: boolean
          canal?: string
          clinica_id: string
          created_at?: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id?: string
        }
        Update: {
          ativo?: boolean
          canal?: string
          clinica_id?: string
          created_at?: string
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_horarios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_kb: {
        Row: {
          categoria: string | null
          clinica_id: string
          conteudo: string
          created_at: string
          id: string
          publicado: boolean
          tags: string[] | null
          titulo: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          clinica_id: string
          conteudo: string
          created_at?: string
          id?: string
          publicado?: boolean
          tags?: string[] | null
          titulo: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          clinica_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          publicado?: boolean
          tags?: string[] | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_kb_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_macros: {
        Row: {
          atalho: string
          ativo: boolean
          clinica_id: string
          conteudo: string
          created_at: string
          id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          atalho: string
          ativo?: boolean
          clinica_id: string
          conteudo: string
          created_at?: string
          id?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          atalho?: string
          ativo?: boolean
          clinica_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_macros_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_msg_fora_horario: {
        Row: {
          ativo: boolean
          clinica_id: string
          mensagem: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          mensagem?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          mensagem?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_msg_fora_horario_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_notas_internas: {
        Row: {
          autor_nome: string | null
          autor_user_id: string
          clinica_id: string
          conteudo: string
          conversa_id: string
          created_at: string
          id: string
        }
        Insert: {
          autor_nome?: string | null
          autor_user_id: string
          clinica_id: string
          conteudo: string
          conversa_id: string
          created_at?: string
          id?: string
        }
        Update: {
          autor_nome?: string | null
          autor_user_id?: string
          clinica_id?: string
          conteudo?: string
          conversa_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_notas_internas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_notas_internas_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "atend_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_numeros_autorizados: {
        Row: {
          clinica_id: string
          created_at: string
          id: string
          nota: string | null
          telefone: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          id?: string
          nota?: string | null
          telefone: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          id?: string
          nota?: string | null
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_numeros_autorizados_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_pausas_log: {
        Row: {
          clinica_id: string
          finalizada_em: string | null
          id: string
          iniciada_em: string
          reason_id: string | null
          user_id: string
        }
        Insert: {
          clinica_id: string
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          reason_id?: string | null
          user_id: string
        }
        Update: {
          clinica_id?: string
          finalizada_em?: string | null
          id?: string
          iniciada_em?: string
          reason_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_pausas_log_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_pausas_log_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "atend_pause_reasons"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_pause_reasons: {
        Row: {
          ativo: boolean
          clinica_id: string
          conta_trabalhado: boolean
          cor: string | null
          created_at: string
          icone: string | null
          id: string
          nome: string
          tolerancia_minutos: number
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          conta_trabalhado?: boolean
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome: string
          tolerancia_minutos?: number
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          conta_trabalhado?: boolean
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome?: string
          tolerancia_minutos?: number
        }
        Relationships: [
          {
            foreignKeyName: "atend_pause_reasons_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_protocolo_config: {
        Row: {
          clinica_id: string
          formato: string
          prefixo: string
          proximo_seq: number
          updated_at: string
          zerar_anualmente: boolean
        }
        Insert: {
          clinica_id: string
          formato?: string
          prefixo?: string
          proximo_seq?: number
          updated_at?: string
          zerar_anualmente?: boolean
        }
        Update: {
          clinica_id?: string
          formato?: string
          prefixo?: string
          proximo_seq?: number
          updated_at?: string
          zerar_anualmente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "atend_protocolo_config_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_routing_rules: {
        Row: {
          ativo: boolean
          canal: string | null
          clinica_id: string
          created_at: string
          departamento_id: string | null
          dias_semana: number[]
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          mensagem_auto: string | null
          nome: string
          ordem: number
          palavras_chave: string[]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          canal?: string | null
          clinica_id: string
          created_at?: string
          departamento_id?: string | null
          dias_semana?: number[]
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          mensagem_auto?: string | null
          nome: string
          ordem?: number
          palavras_chave?: string[]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          canal?: string | null
          clinica_id?: string
          created_at?: string
          departamento_id?: string | null
          dias_semana?: number[]
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          mensagem_auto?: string | null
          nome?: string
          ordem?: number
          palavras_chave?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atend_routing_rules_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_routing_rules_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "atend_departamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      atend_transferencias: {
        Row: {
          clinica_id: string
          conversa_id: string
          created_at: string
          de_departamento_id: string | null
          de_user_id: string | null
          id: string
          motivo: string | null
          para_departamento_id: string | null
          para_user_id: string | null
        }
        Insert: {
          clinica_id: string
          conversa_id: string
          created_at?: string
          de_departamento_id?: string | null
          de_user_id?: string | null
          id?: string
          motivo?: string | null
          para_departamento_id?: string | null
          para_user_id?: string | null
        }
        Update: {
          clinica_id?: string
          conversa_id?: string
          created_at?: string
          de_departamento_id?: string | null
          de_user_id?: string | null
          id?: string
          motivo?: string | null
          para_departamento_id?: string | null
          para_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atend_transferencias_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atend_transferencias_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "atend_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          clinica_id: string | null
          created_at: string
          dados_antes: Json | null
          dados_depois: Json | null
          id: string
          ip_address: unknown
          record_id: string | null
          table_name: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          clinica_id?: string | null
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          ip_address?: unknown
          record_id?: string | null
          table_name: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          clinica_id?: string | null
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          ip_address?: unknown
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backup_execucoes: {
        Row: {
          arquivos: number | null
          bytes: number | null
          clinica_id: string | null
          created_at: string
          data_ref: string
          erro: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          status: string
          tabelas: number | null
          updated_at: string
        }
        Insert: {
          arquivos?: number | null
          bytes?: number | null
          clinica_id?: string | null
          created_at?: string
          data_ref: string
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          status?: string
          tabelas?: number | null
          updated_at?: string
        }
        Update: {
          arquivos?: number | null
          bytes?: number | null
          clinica_id?: string | null
          created_at?: string
          data_ref?: string
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          status?: string
          tabelas?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_execucoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      boletos: {
        Row: {
          banco: string | null
          clinica_id: string
          codigo_barras: string | null
          contrato_id: string | null
          created_at: string
          emitido_em: string | null
          erro_emissao: string | null
          id: string
          lancamento_id: string | null
          linha_digitavel: string | null
          mensalidade_id: string | null
          nosso_numero: string | null
          observacoes: string | null
          paciente_id: string | null
          pago_em: string | null
          status: string
          updated_at: string
          url_pdf: string | null
          valor: number
          vencimento: string
        }
        Insert: {
          banco?: string | null
          clinica_id: string
          codigo_barras?: string | null
          contrato_id?: string | null
          created_at?: string
          emitido_em?: string | null
          erro_emissao?: string | null
          id?: string
          lancamento_id?: string | null
          linha_digitavel?: string | null
          mensalidade_id?: string | null
          nosso_numero?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          pago_em?: string | null
          status?: string
          updated_at?: string
          url_pdf?: string | null
          valor: number
          vencimento: string
        }
        Update: {
          banco?: string | null
          clinica_id?: string
          codigo_barras?: string | null
          contrato_id?: string | null
          created_at?: string
          emitido_em?: string | null
          erro_emissao?: string | null
          id?: string
          lancamento_id?: string | null
          linha_digitavel?: string | null
          mensalidade_id?: string | null
          nosso_numero?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          pago_em?: string | null
          status?: string
          updated_at?: string
          url_pdf?: string | null
          valor?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "boletos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boletos_mensalidade_id_fkey"
            columns: ["mensalidade_id"]
            isOneToOne: false
            referencedRelation: "contrato_mensalidades"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_movimentos: {
        Row: {
          clinica_id: string
          created_at: string
          descricao: string | null
          destino_nome: string | null
          destino_user_id: string | null
          forma_pagamento: string | null
          id: string
          lancamento_id: string | null
          sessao_id: string
          tipo: Database["public"]["Enums"]["caixa_mov_tipo"]
          user_id: string
          valor: number
        }
        Insert: {
          clinica_id: string
          created_at?: string
          descricao?: string | null
          destino_nome?: string | null
          destino_user_id?: string | null
          forma_pagamento?: string | null
          id?: string
          lancamento_id?: string | null
          sessao_id: string
          tipo: Database["public"]["Enums"]["caixa_mov_tipo"]
          user_id: string
          valor?: number
        }
        Update: {
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          destino_nome?: string | null
          destino_user_id?: string | null
          forma_pagamento?: string | null
          id?: string
          lancamento_id?: string | null
          sessao_id?: string
          tipo?: Database["public"]["Enums"]["caixa_mov_tipo"]
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixa_movimentos_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "caixa_sessoes"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_sessoes: {
        Row: {
          aberto_em: string
          clinica_id: string
          created_at: string
          diferenca: number | null
          fechado_em: string | null
          id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["caixa_sessao_status"]
          updated_at: string
          user_id: string
          user_nome: string | null
          valor_abertura: number
          valor_fechamento_calculado: number | null
          valor_fechamento_informado: number | null
        }
        Insert: {
          aberto_em?: string
          clinica_id: string
          created_at?: string
          diferenca?: number | null
          fechado_em?: string | null
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["caixa_sessao_status"]
          updated_at?: string
          user_id: string
          user_nome?: string | null
          valor_abertura?: number
          valor_fechamento_calculado?: number | null
          valor_fechamento_informado?: number | null
        }
        Update: {
          aberto_em?: string
          clinica_id?: string
          created_at?: string
          diferenca?: number | null
          fechado_em?: string | null
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["caixa_sessao_status"]
          updated_at?: string
          user_id?: string
          user_nome?: string | null
          valor_abertura?: number
          valor_fechamento_calculado?: number | null
          valor_fechamento_informado?: number | null
        }
        Relationships: []
      }
      campanhas_marketing: {
        Row: {
          agendada_para: string | null
          clinica_id: string
          created_at: string
          enviada_em: string | null
          id: string
          mensagem: string
          nome: string
          segmento: string | null
          status: string
          tipo: string
          total_envios: number
          updated_at: string
        }
        Insert: {
          agendada_para?: string | null
          clinica_id: string
          created_at?: string
          enviada_em?: string | null
          id?: string
          mensagem: string
          nome: string
          segmento?: string | null
          status?: string
          tipo?: string
          total_envios?: number
          updated_at?: string
        }
        Update: {
          agendada_para?: string | null
          clinica_id?: string
          created_at?: string
          enviada_em?: string | null
          id?: string
          mensagem?: string
          nome?: string
          segmento?: string | null
          status?: string
          tipo?: string
          total_envios?: number
          updated_at?: string
        }
        Relationships: []
      }
      cargos: {
        Row: {
          ativo: boolean
          cbo: string | null
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          salario_base: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cbo?: string | null
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          salario_base?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cbo?: string | null
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          salario_base?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      cartoes_convenio: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          percentual_desconto: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          percentual_desconto?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          percentual_desconto?: number
          updated_at?: string
        }
        Relationships: []
      }
      cb_beneficios: {
        Row: {
          ativo: boolean
          clinica_id: string
          convenio_id: string
          created_at: string
          descricao: string | null
          escopo: string
          especialidade_id: string | null
          excedente_modo: string | null
          excedente_percentual: number | null
          excedente_valor: number | null
          id: string
          inicio_a_partir: number
          limite_escopo: string | null
          limite_periodo: string | null
          limite_qtd: number | null
          limite_uso: string
          nome: string
          periodicidade: string
          pessoa: string
          prioridade: number
          procedimento_id: string | null
          procedimento_ids: string[]
          tipo_desconto: string
          updated_at: string
          valor_desconto: number | null
          valor_outros: number | null
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          convenio_id: string
          created_at?: string
          descricao?: string | null
          escopo?: string
          especialidade_id?: string | null
          excedente_modo?: string | null
          excedente_percentual?: number | null
          excedente_valor?: number | null
          id?: string
          inicio_a_partir?: number
          limite_escopo?: string | null
          limite_periodo?: string | null
          limite_qtd?: number | null
          limite_uso?: string
          nome: string
          periodicidade?: string
          pessoa?: string
          prioridade?: number
          procedimento_id?: string | null
          procedimento_ids?: string[]
          tipo_desconto?: string
          updated_at?: string
          valor_desconto?: number | null
          valor_outros?: number | null
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          convenio_id?: string
          created_at?: string
          descricao?: string | null
          escopo?: string
          especialidade_id?: string | null
          excedente_modo?: string | null
          excedente_percentual?: number | null
          excedente_valor?: number | null
          id?: string
          inicio_a_partir?: number
          limite_escopo?: string | null
          limite_periodo?: string | null
          limite_qtd?: number | null
          limite_uso?: string
          nome?: string
          periodicidade?: string
          pessoa?: string
          prioridade?: number
          procedimento_id?: string | null
          procedimento_ids?: string[]
          tipo_desconto?: string
          updated_at?: string
          valor_desconto?: number | null
          valor_outros?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cb_beneficios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_beneficios_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_beneficios_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_beneficios_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_convenio_faixas: {
        Row: {
          convenio_id: string
          created_at: string
          id: string
          updated_at: string
          valor_mensal: number
          vidas_ate: number | null
          vidas_de: number
        }
        Insert: {
          convenio_id: string
          created_at?: string
          id?: string
          updated_at?: string
          valor_mensal?: number
          vidas_ate?: number | null
          vidas_de: number
        }
        Update: {
          convenio_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          valor_mensal?: number
          vidas_ate?: number | null
          vidas_de?: number
        }
        Relationships: [
          {
            foreignKeyName: "cb_convenio_faixas_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_convenio_regras: {
        Row: {
          ativo: boolean
          carencia_mensalidades: number
          clinica_id: string
          convenio_id: string
          created_at: string
          especialidade_id: string | null
          excedente_modo: string | null
          excedente_percentual: number | null
          excedente_valor: number | null
          gratuito: boolean
          grupo_gratuidade: string | null
          id: string
          limite_escopo: string | null
          limite_periodo: string | null
          limite_qtd: number | null
          modo: string
          nome_padrao: string | null
          percentual: number | null
          prioridade: number
          procedimento_id: string | null
          tipo: string | null
          updated_at: string
          valor: number | null
        }
        Insert: {
          ativo?: boolean
          carencia_mensalidades?: number
          clinica_id: string
          convenio_id: string
          created_at?: string
          especialidade_id?: string | null
          excedente_modo?: string | null
          excedente_percentual?: number | null
          excedente_valor?: number | null
          gratuito?: boolean
          grupo_gratuidade?: string | null
          id?: string
          limite_escopo?: string | null
          limite_periodo?: string | null
          limite_qtd?: number | null
          modo: string
          nome_padrao?: string | null
          percentual?: number | null
          prioridade?: number
          procedimento_id?: string | null
          tipo?: string | null
          updated_at?: string
          valor?: number | null
        }
        Update: {
          ativo?: boolean
          carencia_mensalidades?: number
          clinica_id?: string
          convenio_id?: string
          created_at?: string
          especialidade_id?: string | null
          excedente_modo?: string | null
          excedente_percentual?: number | null
          excedente_valor?: number | null
          gratuito?: boolean
          grupo_gratuidade?: string | null
          id?: string
          limite_escopo?: string | null
          limite_periodo?: string | null
          limite_qtd?: number | null
          modo?: string
          nome_padrao?: string | null
          percentual?: number | null
          prioridade?: number
          procedimento_id?: string | null
          tipo?: string | null
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cb_convenio_regras_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_convenio_regras_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_convenio_regras_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cb_convenio_regras_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      cb_convenios: {
        Row: {
          ativo: boolean
          beneficios: string | null
          clinica_id: string
          created_at: string
          descricao: string | null
          fidelidade_meses: number
          id: string
          informativo_html: string | null
          max_dependentes: number
          modelo_contrato: string | null
          nome: string
          num_parcelas: number
          taxa_adesao: number
          taxa_inclusao_dependente: number
          termo_inclusao_html: string | null
          updated_at: string
          valor_mensal: number
          vigencia_meses: number
        }
        Insert: {
          ativo?: boolean
          beneficios?: string | null
          clinica_id: string
          created_at?: string
          descricao?: string | null
          fidelidade_meses?: number
          id?: string
          informativo_html?: string | null
          max_dependentes?: number
          modelo_contrato?: string | null
          nome: string
          num_parcelas?: number
          taxa_adesao?: number
          taxa_inclusao_dependente?: number
          termo_inclusao_html?: string | null
          updated_at?: string
          valor_mensal?: number
          vigencia_meses?: number
        }
        Update: {
          ativo?: boolean
          beneficios?: string | null
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          fidelidade_meses?: number
          id?: string
          informativo_html?: string | null
          max_dependentes?: number
          modelo_contrato?: string | null
          nome?: string
          num_parcelas?: number
          taxa_adesao?: number
          taxa_inclusao_dependente?: number
          termo_inclusao_html?: string | null
          updated_at?: string
          valor_mensal?: number
          vigencia_meses?: number
        }
        Relationships: [
          {
            foreignKeyName: "cb_convenios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_canais: {
        Row: {
          clinica_id: string
          created_at: string
          criado_por: string
          id: string
          nome: string | null
          setor_id: string | null
          tipo: Database["public"]["Enums"]["chat_canal_tipo"]
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          criado_por: string
          id?: string
          nome?: string | null
          setor_id?: string | null
          tipo?: Database["public"]["Enums"]["chat_canal_tipo"]
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          criado_por?: string
          id?: string
          nome?: string | null
          setor_id?: string | null
          tipo?: Database["public"]["Enums"]["chat_canal_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_canais_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_leituras: {
        Row: {
          canal_id: string
          id: string
          ultima_lida_em: string
          user_id: string
        }
        Insert: {
          canal_id: string
          id?: string
          ultima_lida_em?: string
          user_id: string
        }
        Update: {
          canal_id?: string
          id?: string
          ultima_lida_em?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_leituras_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "chat_canais"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_membros: {
        Row: {
          canal_id: string
          created_at: string
          id: string
          papel: string
          silenciado: boolean
          user_id: string
        }
        Insert: {
          canal_id: string
          created_at?: string
          id?: string
          papel?: string
          silenciado?: boolean
          user_id: string
        }
        Update: {
          canal_id?: string
          created_at?: string
          id?: string
          papel?: string
          silenciado?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_membros_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "chat_canais"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_mensagens: {
        Row: {
          anexo_tipo: string | null
          anexo_url: string | null
          autor_id: string
          canal_id: string
          clinica_id: string
          created_at: string
          deletada_em: string | null
          editada_em: string | null
          id: string
          reply_to: string | null
          texto: string | null
        }
        Insert: {
          anexo_tipo?: string | null
          anexo_url?: string | null
          autor_id: string
          canal_id: string
          clinica_id: string
          created_at?: string
          deletada_em?: string | null
          editada_em?: string | null
          id?: string
          reply_to?: string | null
          texto?: string | null
        }
        Update: {
          anexo_tipo?: string | null
          anexo_url?: string | null
          autor_id?: string
          canal_id?: string
          clinica_id?: string
          created_at?: string
          deletada_em?: string | null
          editada_em?: string | null
          id?: string
          reply_to?: string | null
          texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_mensagens_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "chat_canais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_mensagens_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "chat_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      clinica_feature_flags: {
        Row: {
          ativo: boolean
          clinica_id: string
          config: Json
          created_at: string
          created_by: string | null
          descricao: string | null
          flag_key: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          config?: Json
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          flag_key: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          flag_key?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinica_feature_flags_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      clinica_memberships: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinica_memberships_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      clinicas: {
        Row: {
          ativo: boolean
          base_importada: boolean
          branding: Json
          cep: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nfse_modo_emissao: string
          nome: string
          paytime_recipient_id: string | null
          raio_metros: number
          telefone: string | null
          token_publico: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          base_importada?: boolean
          branding?: Json
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nfse_modo_emissao?: string
          nome: string
          paytime_recipient_id?: string | null
          raio_metros?: number
          telefone?: string | null
          token_publico?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          base_importada?: boolean
          branding?: Json
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nfse_modo_emissao?: string
          nome?: string
          paytime_recipient_id?: string | null
          raio_metros?: number
          telefone?: string | null
          token_publico?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contrato_dependentes: {
        Row: {
          ativo: boolean
          contrato_id: string
          created_at: string
          excluido_em: string | null
          id: string
          incluido_em: string
          paciente_id: string
          paciente_nome: string
          parentesco: string | null
          tipo: string
        }
        Insert: {
          ativo?: boolean
          contrato_id: string
          created_at?: string
          excluido_em?: string | null
          id?: string
          incluido_em?: string
          paciente_id: string
          paciente_nome: string
          parentesco?: string | null
          tipo?: string
        }
        Update: {
          ativo?: boolean
          contrato_id?: string
          created_at?: string
          excluido_em?: string | null
          id?: string
          incluido_em?: string
          paciente_id?: string
          paciente_nome?: string
          parentesco?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_dependentes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_mensalidades: {
        Row: {
          clinica_id: string
          contrato_id: string
          created_at: string
          forma_pagamento: string | null
          id: string
          juros: number | null
          lancamento_id: string | null
          multa: number | null
          numero_parcela: number
          observacoes: string | null
          pago_em: string | null
          status: string
          taxa_adesao: number
          updated_at: string
          valor: number
          valor_pago: number | null
          vencimento: string
        }
        Insert: {
          clinica_id: string
          contrato_id: string
          created_at?: string
          forma_pagamento?: string | null
          id?: string
          juros?: number | null
          lancamento_id?: string | null
          multa?: number | null
          numero_parcela: number
          observacoes?: string | null
          pago_em?: string | null
          status?: string
          taxa_adesao?: number
          updated_at?: string
          valor?: number
          valor_pago?: number | null
          vencimento: string
        }
        Update: {
          clinica_id?: string
          contrato_id?: string
          created_at?: string
          forma_pagamento?: string | null
          id?: string
          juros?: number | null
          lancamento_id?: string | null
          multa?: number | null
          numero_parcela?: number
          observacoes?: string | null
          pago_em?: string | null
          status?: string
          taxa_adesao?: number
          updated_at?: string
          valor?: number
          valor_pago?: number | null
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_mensalidades_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_renovacoes: {
        Row: {
          clinica_id: string
          contrato_id: string
          contrato_novo_id: string | null
          convenio_anterior_id: string | null
          convenio_novo_id: string | null
          created_at: string
          dependentes_incluidos: Json | null
          id: string
          observacao: string | null
          parcelas_geradas: number
          periodo_fim: string | null
          periodo_inicio: string | null
          tipo: string
          usuario_id: string | null
          valor_anterior: number
          valor_novo: number
        }
        Insert: {
          clinica_id: string
          contrato_id: string
          contrato_novo_id?: string | null
          convenio_anterior_id?: string | null
          convenio_novo_id?: string | null
          created_at?: string
          dependentes_incluidos?: Json | null
          id?: string
          observacao?: string | null
          parcelas_geradas?: number
          periodo_fim?: string | null
          periodo_inicio?: string | null
          tipo: string
          usuario_id?: string | null
          valor_anterior?: number
          valor_novo?: number
        }
        Update: {
          clinica_id?: string
          contrato_id?: string
          contrato_novo_id?: string | null
          convenio_anterior_id?: string | null
          convenio_novo_id?: string | null
          created_at?: string
          dependentes_incluidos?: Json | null
          id?: string
          observacao?: string | null
          parcelas_geradas?: number
          periodo_fim?: string | null
          periodo_inicio?: string | null
          tipo?: string
          usuario_id?: string | null
          valor_anterior?: number
          valor_novo?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_renovacoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_renovacoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_renovacoes_contrato_novo_id_fkey"
            columns: ["contrato_novo_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_renovacoes_convenio_anterior_id_fkey"
            columns: ["convenio_anterior_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_renovacoes_convenio_novo_id_fkey"
            columns: ["convenio_novo_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_assinatura: {
        Row: {
          assinado_em: string | null
          assinatura_ip: string | null
          assinatura_svg: string | null
          cancelado_em: string | null
          cancelamento_motivo: string | null
          clinica_id: string
          contrato_origem_id: string | null
          convenio_id: string | null
          created_at: string
          criado_por: string | null
          data_fim: string | null
          data_inicio: string
          dia_vencimento: number
          forma_pagamento: string | null
          id: string
          migrar_apos: string | null
          num_parcelas: number
          numero: number
          numero_renovacoes: number
          observacoes: string | null
          paciente_id: string
          paciente_nome: string
          plano_id: string | null
          renovado_em: string | null
          sem_carencia: boolean
          sem_carencia_em: string | null
          sem_carencia_motivo: string | null
          sem_carencia_por: string | null
          status: string
          tabela_legada: boolean
          taxa_adesao: number
          titular_apenas_financeiro: boolean
          token_publico: string | null
          updated_at: string
          valor_mensal: number
        }
        Insert: {
          assinado_em?: string | null
          assinatura_ip?: string | null
          assinatura_svg?: string | null
          cancelado_em?: string | null
          cancelamento_motivo?: string | null
          clinica_id: string
          contrato_origem_id?: string | null
          convenio_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          dia_vencimento?: number
          forma_pagamento?: string | null
          id?: string
          migrar_apos?: string | null
          num_parcelas?: number
          numero?: number
          numero_renovacoes?: number
          observacoes?: string | null
          paciente_id: string
          paciente_nome: string
          plano_id?: string | null
          renovado_em?: string | null
          sem_carencia?: boolean
          sem_carencia_em?: string | null
          sem_carencia_motivo?: string | null
          sem_carencia_por?: string | null
          status?: string
          tabela_legada?: boolean
          taxa_adesao?: number
          titular_apenas_financeiro?: boolean
          token_publico?: string | null
          updated_at?: string
          valor_mensal?: number
        }
        Update: {
          assinado_em?: string | null
          assinatura_ip?: string | null
          assinatura_svg?: string | null
          cancelado_em?: string | null
          cancelamento_motivo?: string | null
          clinica_id?: string
          contrato_origem_id?: string | null
          convenio_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          dia_vencimento?: number
          forma_pagamento?: string | null
          id?: string
          migrar_apos?: string | null
          num_parcelas?: number
          numero?: number
          numero_renovacoes?: number
          observacoes?: string | null
          paciente_id?: string
          paciente_nome?: string
          plano_id?: string | null
          renovado_em?: string | null
          sem_carencia?: boolean
          sem_carencia_em?: string | null
          sem_carencia_motivo?: string | null
          sem_carencia_por?: string | null
          status?: string
          tabela_legada?: boolean
          taxa_adesao?: number
          titular_apenas_financeiro?: boolean
          token_publico?: string | null
          updated_at?: string
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "contratos_assinatura_contrato_origem_id_fkey"
            columns: ["contrato_origem_id"]
            isOneToOne: false
            referencedRelation: "contratos_assinatura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_assinatura_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_assinatura_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos_assinatura"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_etapas: {
        Row: {
          ativo: boolean
          clinica_id: string
          cor: string
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          cor?: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      crm_oportunidades: {
        Row: {
          clinica_id: string
          created_at: string
          email: string | null
          etapa_id: string | null
          id: string
          nome_lead: string
          observacoes: string | null
          origem: string | null
          paciente_id: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["crm_status"]
          telefone: string | null
          updated_at: string
          valor_estimado: number
        }
        Insert: {
          clinica_id: string
          created_at?: string
          email?: string | null
          etapa_id?: string | null
          id?: string
          nome_lead: string
          observacoes?: string | null
          origem?: string | null
          paciente_id?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["crm_status"]
          telefone?: string | null
          updated_at?: string
          valor_estimado?: number
        }
        Update: {
          clinica_id?: string
          created_at?: string
          email?: string | null
          etapa_id?: string | null
          id?: string
          nome_lead?: string
          observacoes?: string | null
          origem?: string | null
          paciente_id?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["crm_status"]
          telefone?: string | null
          updated_at?: string
          valor_estimado?: number
        }
        Relationships: []
      }
      documentos_emitidos: {
        Row: {
          assinado: boolean
          assinado_em: string | null
          clinica_id: string
          conteudo: string
          created_at: string
          id: string
          medico_id: string | null
          modelo_id: string | null
          paciente_id: string | null
          tipo: Database["public"]["Enums"]["tipo_documento"]
          titulo: string
          updated_at: string
        }
        Insert: {
          assinado?: boolean
          assinado_em?: string | null
          clinica_id: string
          conteudo: string
          created_at?: string
          id?: string
          medico_id?: string | null
          modelo_id?: string | null
          paciente_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          titulo: string
          updated_at?: string
        }
        Update: {
          assinado?: boolean
          assinado_em?: string | null
          clinica_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          medico_id?: string | null
          modelo_id?: string | null
          paciente_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      especialidades: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      estoque_movimentos: {
        Row: {
          clinica_id: string
          created_at: string
          custo_unitario: number | null
          data: string
          id: string
          observacoes: string | null
          produto_id: string
          quantidade: number
          tipo: Database["public"]["Enums"]["estoque_movimento_tipo"]
        }
        Insert: {
          clinica_id: string
          created_at?: string
          custo_unitario?: number | null
          data?: string
          id?: string
          observacoes?: string | null
          produto_id: string
          quantidade: number
          tipo: Database["public"]["Enums"]["estoque_movimento_tipo"]
        }
        Update: {
          clinica_id?: string
          created_at?: string
          custo_unitario?: number | null
          data?: string
          id?: string
          observacoes?: string | null
          produto_id?: string
          quantidade?: number
          tipo?: Database["public"]["Enums"]["estoque_movimento_tipo"]
        }
        Relationships: []
      }
      estoque_produtos: {
        Row: {
          ativo: boolean
          clinica_id: string
          codigo: string | null
          created_at: string
          custo_unitario: number
          estoque_atual: number
          estoque_minimo: number
          id: string
          nome: string
          observacoes: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          codigo?: string | null
          created_at?: string
          custo_unitario?: number
          estoque_atual?: number
          estoque_minimo?: number
          id?: string
          nome: string
          observacoes?: string | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          codigo?: string | null
          created_at?: string
          custo_unitario?: number
          estoque_atual?: number
          estoque_minimo?: number
          id?: string
          nome?: string
          observacoes?: string | null
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      estorno_solicitacoes: {
        Row: {
          agendamento_id: string | null
          clinica_id: string
          created_at: string
          data_estorno: string | null
          data_pagamento_original: string | null
          descricao: string | null
          id: string
          lancamento_id: string | null
          motivo: string
          paciente_nome: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          resposta: string | null
          solicitado_em: string
          solicitado_por: string
          status: string
          tipo: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          agendamento_id?: string | null
          clinica_id: string
          created_at?: string
          data_estorno?: string | null
          data_pagamento_original?: string | null
          descricao?: string | null
          id?: string
          lancamento_id?: string | null
          motivo: string
          paciente_nome?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          resposta?: string | null
          solicitado_em?: string
          solicitado_por: string
          status?: string
          tipo?: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          agendamento_id?: string | null
          clinica_id?: string
          created_at?: string
          data_estorno?: string | null
          data_pagamento_original?: string | null
          descricao?: string | null
          id?: string
          lancamento_id?: string | null
          motivo?: string
          paciente_nome?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          resposta?: string | null
          solicitado_em?: string
          solicitado_por?: string
          status?: string
          tipo?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estorno_solicitacoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      exame_resultados: {
        Row: {
          classificado_em: string | null
          classificado_por: string | null
          clinica_id: string
          created_at: string
          created_by: string | null
          data_coleta: string | null
          ia_classificacao: Json | null
          ia_mensagem_paciente: string | null
          ia_recomendacao: string | null
          ia_resumo: string | null
          id: string
          origem: string | null
          paciente_id: string
          paciente_nome: string | null
          resultado_texto: string
          status: Database["public"]["Enums"]["resultado_status"]
          tipo_exame: string
          updated_at: string
        }
        Insert: {
          classificado_em?: string | null
          classificado_por?: string | null
          clinica_id: string
          created_at?: string
          created_by?: string | null
          data_coleta?: string | null
          ia_classificacao?: Json | null
          ia_mensagem_paciente?: string | null
          ia_recomendacao?: string | null
          ia_resumo?: string | null
          id?: string
          origem?: string | null
          paciente_id: string
          paciente_nome?: string | null
          resultado_texto: string
          status?: Database["public"]["Enums"]["resultado_status"]
          tipo_exame: string
          updated_at?: string
        }
        Update: {
          classificado_em?: string | null
          classificado_por?: string | null
          clinica_id?: string
          created_at?: string
          created_by?: string | null
          data_coleta?: string | null
          ia_classificacao?: Json | null
          ia_mensagem_paciente?: string | null
          ia_recomendacao?: string | null
          ia_resumo?: string | null
          id?: string
          origem?: string | null
          paciente_id?: string
          paciente_nome?: string | null
          resultado_texto?: string
          status?: Database["public"]["Enums"]["resultado_status"]
          tipo_exame?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exame_resultados_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exame_resultados_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_alertas: {
        Row: {
          clinica_id: string
          created_at: string
          data_alerta: string
          id: string
          lancamento_id: string | null
          lido: boolean
          mensagem: string
          tipo_alerta: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          data_alerta?: string
          id?: string
          lancamento_id?: string | null
          lido?: boolean
          mensagem: string
          tipo_alerta: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          data_alerta?: string
          id?: string
          lancamento_id?: string | null
          lido?: boolean
          mensagem?: string
          tipo_alerta?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_alertas_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_atendimentos: {
        Row: {
          agendamento_id: string | null
          clinica_id: string
          created_at: string
          data: string
          forma_pagamento: string | null
          id: string
          lancamento_id: string | null
          laudo_de_atendimento_id: string | null
          laudo_emitido_em: string | null
          laudo_lancamento_id: string | null
          laudo_status: string | null
          medico_id: string | null
          medico_laudador_id: string | null
          nfse_id: string | null
          observacoes: string | null
          orcamento_item_id: string | null
          paciente_id: string | null
          procedimento: string | null
          repasse_conta_id: string | null
          repasse_forma_pagamento: string | null
          repasse_lancamento_id: string | null
          repasse_lock_id: string | null
          repasse_pago: boolean
          repasse_pago_at: string | null
          repasse_pago_em: string | null
          repasse_pago_por: string | null
          status: string
          updated_at: string
          valor_clinica: number
          valor_laudo: number
          valor_medico: number
          valor_total: number
        }
        Insert: {
          agendamento_id?: string | null
          clinica_id: string
          created_at?: string
          data?: string
          forma_pagamento?: string | null
          id?: string
          lancamento_id?: string | null
          laudo_de_atendimento_id?: string | null
          laudo_emitido_em?: string | null
          laudo_lancamento_id?: string | null
          laudo_status?: string | null
          medico_id?: string | null
          medico_laudador_id?: string | null
          nfse_id?: string | null
          observacoes?: string | null
          orcamento_item_id?: string | null
          paciente_id?: string | null
          procedimento?: string | null
          repasse_conta_id?: string | null
          repasse_forma_pagamento?: string | null
          repasse_lancamento_id?: string | null
          repasse_lock_id?: string | null
          repasse_pago?: boolean
          repasse_pago_at?: string | null
          repasse_pago_em?: string | null
          repasse_pago_por?: string | null
          status?: string
          updated_at?: string
          valor_clinica?: number
          valor_laudo?: number
          valor_medico?: number
          valor_total?: number
        }
        Update: {
          agendamento_id?: string | null
          clinica_id?: string
          created_at?: string
          data?: string
          forma_pagamento?: string | null
          id?: string
          lancamento_id?: string | null
          laudo_de_atendimento_id?: string | null
          laudo_emitido_em?: string | null
          laudo_lancamento_id?: string | null
          laudo_status?: string | null
          medico_id?: string | null
          medico_laudador_id?: string | null
          nfse_id?: string | null
          observacoes?: string | null
          orcamento_item_id?: string | null
          paciente_id?: string | null
          procedimento?: string | null
          repasse_conta_id?: string | null
          repasse_forma_pagamento?: string | null
          repasse_lancamento_id?: string | null
          repasse_lock_id?: string | null
          repasse_pago?: boolean
          repasse_pago_at?: string | null
          repasse_pago_em?: string | null
          repasse_pago_por?: string | null
          status?: string
          updated_at?: string
          valor_clinica?: number
          valor_laudo?: number
          valor_medico?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_atendimentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_laudo_de_atendimento_id_fkey"
            columns: ["laudo_de_atendimento_id"]
            isOneToOne: false
            referencedRelation: "fin_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_laudo_lancamento_id_fkey"
            columns: ["laudo_lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_medico_laudador_id_fkey"
            columns: ["medico_laudador_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_nfse_id_fkey"
            columns: ["nfse_id"]
            isOneToOne: false
            referencedRelation: "nfse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_orcamento_item_id_fkey"
            columns: ["orcamento_item_id"]
            isOneToOne: false
            referencedRelation: "orcamento_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_atendimentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_categorias: {
        Row: {
          ativo: boolean
          clinica_id: string
          cor: string
          created_at: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          cor?: string
          created_at?: string
          id?: string
          nome: string
          tipo: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at?: string
        }
        Relationships: []
      }
      fin_contas: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco: string | null
          bandeira: string | null
          clinica_id: string
          conta: string | null
          created_at: string
          id: string
          nome: string
          saldo_inicial: number
          tipo: Database["public"]["Enums"]["fin_tipo_conta"]
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          bandeira?: string | null
          clinica_id: string
          conta?: string | null
          created_at?: string
          id?: string
          nome: string
          saldo_inicial?: number
          tipo?: Database["public"]["Enums"]["fin_tipo_conta"]
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          bandeira?: string | null
          clinica_id?: string
          conta?: string | null
          created_at?: string
          id?: string
          nome?: string
          saldo_inicial?: number
          tipo?: Database["public"]["Enums"]["fin_tipo_conta"]
          updated_at?: string
        }
        Relationships: []
      }
      fin_empresas: {
        Row: {
          ativo: boolean
          clinica_id: string
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fin_lancamentos: {
        Row: {
          agendamento_id: string | null
          autorizacao_cartao: string | null
          bandeira_cartao: string | null
          categoria_id: string | null
          clinica_id: string
          conta_id: string | null
          created_at: string
          criado_por: string | null
          data: string
          data_cartao: string | null
          data_vencimento: string | null
          descricao: string
          emitir_nfse: boolean
          empresa_id: string | null
          forma_pagamento: string | null
          grupo_pagamento_id: string | null
          id: string
          laudo_emitido_em: string | null
          laudo_lancamento_id: string | null
          laudo_lote_id: string | null
          laudo_status: string | null
          medico_id: string | null
          medico_laudador_id: string | null
          observacoes: string | null
          paciente_id: string | null
          parcelas: number | null
          repasse_conta_id: string | null
          repasse_forma_pagamento: string | null
          repasse_lancamento_id: string | null
          repasse_lock_id: string | null
          repasse_pago: boolean
          repasse_pago_at: string | null
          repasse_pago_em: string | null
          repasse_pago_por: string | null
          status: Database["public"]["Enums"]["fin_status_lancamento"]
          tipo: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at: string
          valor: number
          valor_laudo: number
          valor_liquido_cartao: number | null
          valor_medico_override: number | null
        }
        Insert: {
          agendamento_id?: string | null
          autorizacao_cartao?: string | null
          bandeira_cartao?: string | null
          categoria_id?: string | null
          clinica_id: string
          conta_id?: string | null
          created_at?: string
          criado_por?: string | null
          data?: string
          data_cartao?: string | null
          data_vencimento?: string | null
          descricao: string
          emitir_nfse?: boolean
          empresa_id?: string | null
          forma_pagamento?: string | null
          grupo_pagamento_id?: string | null
          id?: string
          laudo_emitido_em?: string | null
          laudo_lancamento_id?: string | null
          laudo_lote_id?: string | null
          laudo_status?: string | null
          medico_id?: string | null
          medico_laudador_id?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          parcelas?: number | null
          repasse_conta_id?: string | null
          repasse_forma_pagamento?: string | null
          repasse_lancamento_id?: string | null
          repasse_lock_id?: string | null
          repasse_pago?: boolean
          repasse_pago_at?: string | null
          repasse_pago_em?: string | null
          repasse_pago_por?: string | null
          status?: Database["public"]["Enums"]["fin_status_lancamento"]
          tipo: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at?: string
          valor: number
          valor_laudo?: number
          valor_liquido_cartao?: number | null
          valor_medico_override?: number | null
        }
        Update: {
          agendamento_id?: string | null
          autorizacao_cartao?: string | null
          bandeira_cartao?: string | null
          categoria_id?: string | null
          clinica_id?: string
          conta_id?: string | null
          created_at?: string
          criado_por?: string | null
          data?: string
          data_cartao?: string | null
          data_vencimento?: string | null
          descricao?: string
          emitir_nfse?: boolean
          empresa_id?: string | null
          forma_pagamento?: string | null
          grupo_pagamento_id?: string | null
          id?: string
          laudo_emitido_em?: string | null
          laudo_lancamento_id?: string | null
          laudo_lote_id?: string | null
          laudo_status?: string | null
          medico_id?: string | null
          medico_laudador_id?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          parcelas?: number | null
          repasse_conta_id?: string | null
          repasse_forma_pagamento?: string | null
          repasse_lancamento_id?: string | null
          repasse_lock_id?: string | null
          repasse_pago?: boolean
          repasse_pago_at?: string | null
          repasse_pago_em?: string | null
          repasse_pago_por?: string | null
          status?: Database["public"]["Enums"]["fin_status_lancamento"]
          tipo?: Database["public"]["Enums"]["fin_tipo_lancamento"]
          updated_at?: string
          valor?: number
          valor_laudo?: number
          valor_liquido_cartao?: number | null
          valor_medico_override?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamentos_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "fin_empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_laudo_lancamento_id_fkey"
            columns: ["laudo_lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_laudo_lote_id_fkey"
            columns: ["laudo_lote_id"]
            isOneToOne: false
            referencedRelation: "fin_laudo_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_medico_laudador_id_fkey"
            columns: ["medico_laudador_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_laudo_lotes: {
        Row: {
          agenda_medico_id: string
          clinica_id: string
          created_at: string
          criado_por: string | null
          id: string
          observacoes: string | null
          periodo_fim: string
          periodo_inicio: string
          total_ecgs: number
          total_repasse: number
          updated_at: string
        }
        Insert: {
          agenda_medico_id: string
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          id?: string
          observacoes?: string | null
          periodo_fim: string
          periodo_inicio: string
          total_ecgs?: number
          total_repasse?: number
          updated_at?: string
        }
        Update: {
          agenda_medico_id?: string
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          observacoes?: string | null
          periodo_fim?: string
          periodo_inicio?: string
          total_ecgs?: number
          total_repasse?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_laudo_lotes_agenda_medico_id_fkey"
            columns: ["agenda_medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_laudo_lotes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_lembretes: {
        Row: {
          clinica_id: string
          concluido: boolean
          created_at: string
          data_lembrete: string
          descricao: string | null
          id: string
          prioridade: string
          titulo: string
          updated_at: string
        }
        Insert: {
          clinica_id: string
          concluido?: boolean
          created_at?: string
          data_lembrete: string
          descricao?: string | null
          id?: string
          prioridade?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          concluido?: boolean
          created_at?: string
          data_lembrete?: string
          descricao?: string | null
          id?: string
          prioridade?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_notas_pacientes: {
        Row: {
          clinica_id: string
          created_at: string
          data_emissao: string
          id: string
          lancamento_id: string | null
          numero: string | null
          observacoes: string | null
          paciente_id: string | null
          serie: string | null
          status: string
          updated_at: string
          url_pdf: string | null
          valor: number
        }
        Insert: {
          clinica_id: string
          created_at?: string
          data_emissao?: string
          id?: string
          lancamento_id?: string | null
          numero?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          serie?: string | null
          status?: string
          updated_at?: string
          url_pdf?: string | null
          valor?: number
        }
        Update: {
          clinica_id?: string
          created_at?: string
          data_emissao?: string
          id?: string
          lancamento_id?: string | null
          numero?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          serie?: string | null
          status?: string
          updated_at?: string
          url_pdf?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_notas_pacientes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_notas_pacientes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_regras_ia: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          clinica_id: string
          created_at: string
          id: string
          nome: string
          padrao_descricao: string | null
          prioridade: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          clinica_id: string
          created_at?: string
          id?: string
          nome: string
          padrao_descricao?: string | null
          prioridade?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          clinica_id?: string
          created_at?: string
          id?: string
          nome?: string
          padrao_descricao?: string | null
          prioridade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_regras_ia_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      gr_impressoes: {
        Row: {
          agendamento_id: string | null
          clinica_id: string
          created_at: string
          ficha_numero: number | null
          id: string
          impresso_por: string | null
          impresso_por_nome: string | null
          mensalidade_id: string | null
          tipo: string
          via_numero: number
        }
        Insert: {
          agendamento_id?: string | null
          clinica_id: string
          created_at?: string
          ficha_numero?: number | null
          id?: string
          impresso_por?: string | null
          impresso_por_nome?: string | null
          mensalidade_id?: string | null
          tipo?: string
          via_numero: number
        }
        Update: {
          agendamento_id?: string | null
          clinica_id?: string
          created_at?: string
          ficha_numero?: number | null
          id?: string
          impresso_por?: string | null
          impresso_por_nome?: string | null
          mensalidade_id?: string | null
          tipo?: string
          via_numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "gr_impressoes_mensalidade_id_fkey"
            columns: ["mensalidade_id"]
            isOneToOne: false
            referencedRelation: "contrato_mensalidades"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_banco_horas: {
        Row: {
          clinica_id: string
          competencia: string
          contrato_id: string
          created_at: string
          horas_devidas: number
          horas_trabalhadas: number
          id: string
          observacoes: string | null
          saldo: number
          updated_at: string
        }
        Insert: {
          clinica_id: string
          competencia: string
          contrato_id: string
          created_at?: string
          horas_devidas?: number
          horas_trabalhadas?: number
          id?: string
          observacoes?: string | null
          saldo?: number
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          competencia?: string
          contrato_id?: string
          created_at?: string
          horas_devidas?: number
          horas_trabalhadas?: number
          id?: string
          observacoes?: string | null
          saldo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_banco_horas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_banco_horas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "hr_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_contratos: {
        Row: {
          carga_horaria_semanal: number
          cargo_id: string | null
          clinica_id: string
          cpf: string | null
          created_at: string
          data_admissao: string
          data_demissao: string | null
          funcionario_nome: string
          id: string
          numero: number
          observacoes: string | null
          regime: string
          salario: number
          setor_id: string | null
          sexo: string
          status: string
          unidade_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          carga_horaria_semanal?: number
          cargo_id?: string | null
          clinica_id: string
          cpf?: string | null
          created_at?: string
          data_admissao?: string
          data_demissao?: string | null
          funcionario_nome: string
          id?: string
          numero?: number
          observacoes?: string | null
          regime?: string
          salario?: number
          setor_id?: string | null
          sexo?: string
          status?: string
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          carga_horaria_semanal?: number
          cargo_id?: string | null
          clinica_id?: string
          cpf?: string | null
          created_at?: string
          data_admissao?: string
          data_demissao?: string | null
          funcionario_nome?: string
          id?: string
          numero?: number
          observacoes?: string | null
          regime?: string
          salario?: number
          setor_id?: string | null
          sexo?: string
          status?: string
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_contratos_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contratos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contratos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contratos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_escalas: {
        Row: {
          clinica_id: string
          contrato_id: string
          created_at: string
          dia_semana: number
          hora_entrada: string | null
          hora_saida: string | null
          id: string
          intervalo_fim: string | null
          intervalo_inicio: string | null
        }
        Insert: {
          clinica_id: string
          contrato_id: string
          created_at?: string
          dia_semana: number
          hora_entrada?: string | null
          hora_saida?: string | null
          id?: string
          intervalo_fim?: string | null
          intervalo_inicio?: string | null
        }
        Update: {
          clinica_id?: string
          contrato_id?: string
          created_at?: string
          dia_semana?: number
          hora_entrada?: string | null
          hora_saida?: string | null
          id?: string
          intervalo_fim?: string | null
          intervalo_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_escalas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_escalas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "hr_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_ferias: {
        Row: {
          abono_pecuniario: boolean
          aprovado_em: string | null
          aprovado_por: string | null
          clinica_id: string
          contrato_id: string
          created_at: string
          dias: number | null
          fim: string | null
          id: string
          inicio: string | null
          observacoes: string | null
          periodo_aquisitivo_fim: string
          periodo_aquisitivo_inicio: string
          status: string
          updated_at: string
        }
        Insert: {
          abono_pecuniario?: boolean
          aprovado_em?: string | null
          aprovado_por?: string | null
          clinica_id: string
          contrato_id: string
          created_at?: string
          dias?: number | null
          fim?: string | null
          id?: string
          inicio?: string | null
          observacoes?: string | null
          periodo_aquisitivo_fim: string
          periodo_aquisitivo_inicio: string
          status?: string
          updated_at?: string
        }
        Update: {
          abono_pecuniario?: boolean
          aprovado_em?: string | null
          aprovado_por?: string | null
          clinica_id?: string
          contrato_id?: string
          created_at?: string
          dias?: number | null
          fim?: string | null
          id?: string
          inicio?: string | null
          observacoes?: string | null
          periodo_aquisitivo_fim?: string
          periodo_aquisitivo_inicio?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_ferias_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_ferias_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "hr_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_holerites: {
        Row: {
          clinica_id: string
          competencia: string
          contrato_id: string
          created_at: string
          descontos: Json
          id: string
          liquido: number
          observacoes: string | null
          pago_em: string | null
          proventos: Json
          salario_base: number
          status: string
          total_descontos: number
          total_proventos: number
          updated_at: string
        }
        Insert: {
          clinica_id: string
          competencia: string
          contrato_id: string
          created_at?: string
          descontos?: Json
          id?: string
          liquido?: number
          observacoes?: string | null
          pago_em?: string | null
          proventos?: Json
          salario_base?: number
          status?: string
          total_descontos?: number
          total_proventos?: number
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          competencia?: string
          contrato_id?: string
          created_at?: string
          descontos?: Json
          id?: string
          liquido?: number
          observacoes?: string | null
          pago_em?: string | null
          proventos?: Json
          salario_base?: number
          status?: string
          total_descontos?: number
          total_proventos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_holerites_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_holerites_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "hr_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pontos: {
        Row: {
          ajustado: boolean
          ajustado_por: string | null
          clinica_id: string
          contrato_id: string | null
          created_at: string
          dentro_raio: boolean | null
          id: string
          latitude: number | null
          longitude: number | null
          marcado_em: string
          observacao: string | null
          tipo: string
          unidade_id: string | null
          user_id: string
        }
        Insert: {
          ajustado?: boolean
          ajustado_por?: string | null
          clinica_id: string
          contrato_id?: string | null
          created_at?: string
          dentro_raio?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          marcado_em?: string
          observacao?: string | null
          tipo: string
          unidade_id?: string | null
          user_id: string
        }
        Update: {
          ajustado?: boolean
          ajustado_por?: string | null
          clinica_id?: string
          contrato_id?: string | null
          created_at?: string
          dentro_raio?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          marcado_em?: string
          observacao?: string | null
          tipo?: string
          unidade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_pontos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pontos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "hr_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pontos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          chave: string
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          updated_at: string
          valor: string
        }
        Insert: {
          chave: string
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor: string
        }
        Update: {
          chave?: string
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_secrets_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      lgpd_consentimentos: {
        Row: {
          aceito: boolean
          clinica_id: string | null
          created_at: string
          id: string
          ip: string | null
          paciente_id: string | null
          tipo: string
          user_agent: string | null
          user_id: string | null
          versao: string
        }
        Insert: {
          aceito?: boolean
          clinica_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          paciente_id?: string | null
          tipo: string
          user_agent?: string | null
          user_id?: string | null
          versao?: string
        }
        Update: {
          aceito?: boolean
          clinica_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          paciente_id?: string | null
          tipo?: string
          user_agent?: string | null
          user_id?: string | null
          versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "lgpd_consentimentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lgpd_consentimentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      lgpd_solicitacoes: {
        Row: {
          clinica_id: string | null
          created_at: string
          descricao: string | null
          id: string
          paciente_id: string | null
          respondido_em: string | null
          respondido_por: string | null
          resposta: string | null
          status: string
          tipo: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          paciente_id?: string | null
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: string | null
          status?: string
          tipo: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          clinica_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          paciente_id?: string | null
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lgpd_solicitacoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lgpd_solicitacoes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_certificados: {
        Row: {
          clinica_id: string
          codigo_verificacao: string
          curso_id: string
          emitido_em: string
          id: string
          user_id: string
        }
        Insert: {
          clinica_id: string
          codigo_verificacao?: string
          curso_id: string
          emitido_em?: string
          id?: string
          user_id: string
        }
        Update: {
          clinica_id?: string
          codigo_verificacao?: string
          curso_id?: string
          emitido_em?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lms_certificados_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "lms_cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_cursos: {
        Row: {
          capa_url: string | null
          carga_horaria_min: number | null
          clinica_id: string
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          publicado: boolean
          titulo: string
          updated_at: string
        }
        Insert: {
          capa_url?: string | null
          carga_horaria_min?: number | null
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          publicado?: boolean
          titulo: string
          updated_at?: string
        }
        Update: {
          capa_url?: string | null
          carga_horaria_min?: number | null
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          publicado?: boolean
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lms_cursos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_licoes: {
        Row: {
          conteudo: string | null
          created_at: string
          curso_id: string
          duracao_min: number | null
          id: string
          modulo_id: string
          ordem: number
          tipo: Database["public"]["Enums"]["lms_licao_tipo"]
          titulo: string
          video_url: string | null
        }
        Insert: {
          conteudo?: string | null
          created_at?: string
          curso_id: string
          duracao_min?: number | null
          id?: string
          modulo_id: string
          ordem?: number
          tipo?: Database["public"]["Enums"]["lms_licao_tipo"]
          titulo: string
          video_url?: string | null
        }
        Update: {
          conteudo?: string | null
          created_at?: string
          curso_id?: string
          duracao_min?: number | null
          id?: string
          modulo_id?: string
          ordem?: number
          tipo?: Database["public"]["Enums"]["lms_licao_tipo"]
          titulo?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lms_licoes_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "lms_cursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_licoes_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "lms_modulos"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_modulos: {
        Row: {
          created_at: string
          curso_id: string
          id: string
          ordem: number
          titulo: string
        }
        Insert: {
          created_at?: string
          curso_id: string
          id?: string
          ordem?: number
          titulo: string
        }
        Update: {
          created_at?: string
          curso_id?: string
          id?: string
          ordem?: number
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "lms_modulos_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "lms_cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_progresso: {
        Row: {
          concluida_em: string
          curso_id: string
          id: string
          licao_id: string
          nota: number | null
          user_id: string
        }
        Insert: {
          concluida_em?: string
          curso_id: string
          id?: string
          licao_id: string
          nota?: number | null
          user_id: string
        }
        Update: {
          concluida_em?: string
          curso_id?: string
          id?: string
          licao_id?: string
          nota?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lms_progresso_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "lms_cursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_progresso_licao_id_fkey"
            columns: ["licao_id"]
            isOneToOne: false
            referencedRelation: "lms_licoes"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_quizzes: {
        Row: {
          created_at: string
          id: string
          licao_id: string
          nota_minima: number
          perguntas: Json
        }
        Insert: {
          created_at?: string
          id?: string
          licao_id: string
          nota_minima?: number
          perguntas?: Json
        }
        Update: {
          created_at?: string
          id?: string
          licao_id?: string
          nota_minima?: number
          perguntas?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lms_quizzes_licao_id_fkey"
            columns: ["licao_id"]
            isOneToOne: false
            referencedRelation: "lms_licoes"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_trilhas_cargo: {
        Row: {
          cargo_id: string
          clinica_id: string
          curso_id: string
          id: string
          obrigatorio: boolean
        }
        Insert: {
          cargo_id: string
          clinica_id: string
          curso_id: string
          id?: string
          obrigatorio?: boolean
        }
        Update: {
          cargo_id?: string
          clinica_id?: string
          curso_id?: string
          id?: string
          obrigatorio?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "lms_trilhas_cargo_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_trilhas_cargo_curso_id_fkey"
            columns: ["curso_id"]
            isOneToOne: false
            referencedRelation: "lms_cursos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_agenda_procedimentos: {
        Row: {
          agenda_id: string
          clinica_id: string
          created_at: string
          id: string
          procedimento_id: string
        }
        Insert: {
          agenda_id: string
          clinica_id: string
          created_at?: string
          id?: string
          procedimento_id: string
        }
        Update: {
          agenda_id?: string
          clinica_id?: string
          created_at?: string
          id?: string
          procedimento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medico_agenda_procedimentos_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "medico_agendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_agenda_procedimentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_agenda_procedimentos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_agendas: {
        Row: {
          ativo: boolean
          clinica_id: string
          cor: string | null
          created_at: string
          id: string
          medico_id: string | null
          nome: string
          ordem: number
          sala: string | null
          tipo_recurso: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          cor?: string | null
          created_at?: string
          id?: string
          medico_id?: string | null
          nome: string
          ordem?: number
          sala?: string | null
          tipo_recurso?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          cor?: string | null
          created_at?: string
          id?: string
          medico_id?: string | null
          nome?: string
          ordem?: number
          sala?: string | null
          tipo_recurso?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medico_agendas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_agendas_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_biometria: {
        Row: {
          clinica_id: string
          consentimento_em: string
          created_at: string
          descriptor: Json
          id: string
          medico_id: string
          revogado_em: string | null
          user_id: string | null
        }
        Insert: {
          clinica_id: string
          consentimento_em?: string
          created_at?: string
          descriptor: Json
          id?: string
          medico_id: string
          revogado_em?: string | null
          user_id?: string | null
        }
        Update: {
          clinica_id?: string
          consentimento_em?: string
          created_at?: string
          descriptor?: Json
          id?: string
          medico_id?: string
          revogado_em?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      medico_convenios: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          medico_id: string
          nome: string
          percentual: number | null
          tipo_repasse: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          medico_id: string
          nome: string
          percentual?: number | null
          tipo_repasse?: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          medico_id?: string
          nome?: string
          percentual?: number | null
          tipo_repasse?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_convenios_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_disponibilidades: {
        Row: {
          agenda_id: string
          ativo: boolean
          clinica_id: string
          created_at: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
          intervalo_min: number | null
          limite_pacientes: number | null
          medico_id: string
          observacoes: string | null
          updated_at: string
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          agenda_id: string
          ativo?: boolean
          clinica_id: string
          created_at?: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id?: string
          intervalo_min?: number | null
          limite_pacientes?: number | null
          medico_id: string
          observacoes?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          agenda_id?: string
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          intervalo_min?: number | null
          limite_pacientes?: number | null
          medico_id?: string
          observacoes?: string | null
          updated_at?: string
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_disponibilidades_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "medico_agendas"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_especialidades: {
        Row: {
          created_at: string
          especialidade_id: string
          medico_id: string
          rqe_numero: string | null
          tem_rqe: boolean
        }
        Insert: {
          created_at?: string
          especialidade_id: string
          medico_id: string
          rqe_numero?: string | null
          tem_rqe?: boolean
        }
        Update: {
          created_at?: string
          especialidade_id?: string
          medico_id?: string
          rqe_numero?: string | null
          tem_rqe?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "medico_especialidades_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_especialidades_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_expediente_encerramento: {
        Row: {
          clinica_id: string
          data: string
          encerrado_em: string
          encerrado_por: string | null
          id: string
          medico_id: string
          motivo: string | null
        }
        Insert: {
          clinica_id: string
          data?: string
          encerrado_em?: string
          encerrado_por?: string | null
          id?: string
          medico_id: string
          motivo?: string | null
        }
        Update: {
          clinica_id?: string
          data?: string
          encerrado_em?: string
          encerrado_por?: string | null
          id?: string
          medico_id?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_expediente_encerramento_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_expediente_encerramento_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_procedimentos: {
        Row: {
          created_at: string
          especialidade_id: string | null
          id: string
          medico_id: string
          procedimento_id: string
        }
        Insert: {
          created_at?: string
          especialidade_id?: string | null
          id?: string
          medico_id: string
          procedimento_id: string
        }
        Update: {
          created_at?: string
          especialidade_id?: string | null
          id?: string
          medico_id?: string
          procedimento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medico_procedimentos_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_procedimentos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_procedimentos_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_repasse_laudo: {
        Row: {
          agenda_medico_id: string
          ativo: boolean
          clinica_id: string
          created_at: string
          id: string
          laudador_medico_id: string
          percentual: number | null
          tipo_repasse: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          agenda_medico_id: string
          ativo?: boolean
          clinica_id: string
          created_at?: string
          id?: string
          laudador_medico_id: string
          percentual?: number | null
          tipo_repasse: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          agenda_medico_id?: string
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          id?: string
          laudador_medico_id?: string
          percentual?: number | null
          tipo_repasse?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_repasse_laudo_agenda_medico_id_fkey"
            columns: ["agenda_medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_repasse_laudo_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_repasse_laudo_laudador_medico_id_fkey"
            columns: ["laudador_medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medicos: {
        Row: {
          aceita_cartao_beneficios: boolean
          agencia: string | null
          ativo: boolean
          bairro: string | null
          banco: string | null
          cb_percentual_repasse: number | null
          cb_tipo_repasse: string | null
          cb_valor_repasse: number | null
          cep: string | null
          cidade: string | null
          clinica_id: string
          complemento: string | null
          conta: string | null
          cpf: string | null
          created_at: string
          crm: string
          crm_uf: string
          data_nascimento: string | null
          duracao_consulta_min: number
          email: string | null
          especialidade_id: string | null
          estado: string | null
          estado_civil: string | null
          face_atualizado_em: string | null
          face_descriptor: number[] | null
          id: string
          legacy_id: number | null
          logradouro: string | null
          nacionalidade: string | null
          nome: string
          numero: string | null
          paytime_recipient_id: string | null
          percentual_repasse_padrao: number
          pix_chave: string | null
          procedimento_padrao_em_branco: boolean
          procedimento_padrao_id: string | null
          rg: string | null
          rqe_especialidade: string | null
          rqes: Json
          sexo: string
          telefone: string | null
          telefone2: string | null
          tem_rqe: boolean
          tipo_repasse: string
          updated_at: string
          usa_sistema: boolean
          user_id: string | null
          valor_repasse_padrao: number | null
        }
        Insert: {
          aceita_cartao_beneficios?: boolean
          agencia?: string | null
          ativo?: boolean
          bairro?: string | null
          banco?: string | null
          cb_percentual_repasse?: number | null
          cb_tipo_repasse?: string | null
          cb_valor_repasse?: number | null
          cep?: string | null
          cidade?: string | null
          clinica_id: string
          complemento?: string | null
          conta?: string | null
          cpf?: string | null
          created_at?: string
          crm: string
          crm_uf: string
          data_nascimento?: string | null
          duracao_consulta_min?: number
          email?: string | null
          especialidade_id?: string | null
          estado?: string | null
          estado_civil?: string | null
          face_atualizado_em?: string | null
          face_descriptor?: number[] | null
          id?: string
          legacy_id?: number | null
          logradouro?: string | null
          nacionalidade?: string | null
          nome: string
          numero?: string | null
          paytime_recipient_id?: string | null
          percentual_repasse_padrao?: number
          pix_chave?: string | null
          procedimento_padrao_em_branco?: boolean
          procedimento_padrao_id?: string | null
          rg?: string | null
          rqe_especialidade?: string | null
          rqes?: Json
          sexo?: string
          telefone?: string | null
          telefone2?: string | null
          tem_rqe?: boolean
          tipo_repasse?: string
          updated_at?: string
          usa_sistema?: boolean
          user_id?: string | null
          valor_repasse_padrao?: number | null
        }
        Update: {
          aceita_cartao_beneficios?: boolean
          agencia?: string | null
          ativo?: boolean
          bairro?: string | null
          banco?: string | null
          cb_percentual_repasse?: number | null
          cb_tipo_repasse?: string | null
          cb_valor_repasse?: number | null
          cep?: string | null
          cidade?: string | null
          clinica_id?: string
          complemento?: string | null
          conta?: string | null
          cpf?: string | null
          created_at?: string
          crm?: string
          crm_uf?: string
          data_nascimento?: string | null
          duracao_consulta_min?: number
          email?: string | null
          especialidade_id?: string | null
          estado?: string | null
          estado_civil?: string | null
          face_atualizado_em?: string | null
          face_descriptor?: number[] | null
          id?: string
          legacy_id?: number | null
          logradouro?: string | null
          nacionalidade?: string | null
          nome?: string
          numero?: string | null
          paytime_recipient_id?: string | null
          percentual_repasse_padrao?: number
          pix_chave?: string | null
          procedimento_padrao_em_branco?: boolean
          procedimento_padrao_id?: string | null
          rg?: string | null
          rqe_especialidade?: string | null
          rqes?: Json
          sexo?: string
          telefone?: string | null
          telefone2?: string | null
          tem_rqe?: boolean
          tipo_repasse?: string
          updated_at?: string
          usa_sistema?: boolean
          user_id?: string | null
          valor_repasse_padrao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "medicos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicos_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicos_procedimento_padrao_id_fkey"
            columns: ["procedimento_padrao_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_envios: {
        Row: {
          campanha_id: string | null
          canal: string
          clinica_id: string
          created_at: string
          destinatario: string
          enviado_em: string | null
          erro: string | null
          id: string
          paciente_id: string | null
          status: string
        }
        Insert: {
          campanha_id?: string | null
          canal: string
          clinica_id: string
          created_at?: string
          destinatario: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          paciente_id?: string | null
          status?: string
        }
        Update: {
          campanha_id?: string | null
          canal?: string
          clinica_id?: string
          created_at?: string
          destinatario?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          paciente_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_envios_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas_marketing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_envios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_envios_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_landing_pages: {
        Row: {
          campos: Json
          clinica_id: string
          conteudo_html: string | null
          cor_primaria: string | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          hero_imagem_url: string | null
          id: string
          slug: string
          status: string
          subtitulo: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          campos?: Json
          clinica_id: string
          conteudo_html?: string | null
          cor_primaria?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          hero_imagem_url?: string | null
          id?: string
          slug: string
          status?: string
          subtitulo?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          campos?: Json
          clinica_id?: string
          conteudo_html?: string | null
          cor_primaria?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          hero_imagem_url?: string | null
          id?: string
          slug?: string
          status?: string
          subtitulo?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_landing_pages_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_leads: {
        Row: {
          clinica_id: string
          created_at: string
          dados: Json | null
          email: string | null
          id: string
          landing_page_id: string | null
          mensagem: string | null
          nome: string
          origem: string | null
          paciente_id: string | null
          status: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          dados?: Json | null
          email?: string | null
          id?: string
          landing_page_id?: string | null
          mensagem?: string | null
          nome: string
          origem?: string | null
          paciente_id?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          dados?: Json | null
          email?: string | null
          id?: string
          landing_page_id?: string | null
          mensagem?: string | null
          nome?: string
          origem?: string | null
          paciente_id?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_leads_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_leads_landing_page_id_fkey"
            columns: ["landing_page_id"]
            isOneToOne: false
            referencedRelation: "mkt_landing_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_leads_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_segmentos: {
        Row: {
          clinica_id: string
          created_at: string
          created_by: string | null
          descricao: string | null
          filtros: Json
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          filtros?: Json
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          filtros?: Json
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_segmentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_documentos: {
        Row: {
          ativo: boolean
          clinica_id: string
          conteudo: string
          created_at: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["tipo_documento"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          conteudo: string
          created_at?: string
          id?: string
          nome: string
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["tipo_documento"]
          updated_at?: string
        }
        Relationships: []
      }
      nfse: {
        Row: {
          agendamento_id: string | null
          aliquota_iss: number | null
          cancelada_em: string | null
          cancelada_motivo: string | null
          clinica_id: string
          codigo_verificacao: string | null
          created_at: string
          data_emissao: string
          descricao_servicos: string | null
          emitente_id: string | null
          emitida_por: string | null
          erro_mensagem: string | null
          focus_ref: string | null
          focus_status: string | null
          id: string
          medico_id: string | null
          numero: string | null
          observacoes: string | null
          orcamento_id: string | null
          paciente_id: string | null
          pagamento_id: string | null
          payload_envio: Json | null
          payload_resposta: Json | null
          rps_numero: number | null
          rps_serie: string | null
          serie: string | null
          status: string
          tomador_documento: string | null
          tomador_email: string | null
          tomador_endereco: Json | null
          tomador_nome: string | null
          updated_at: string
          url_pdf: string | null
          url_xml: string | null
          valor_iss: number
          valor_liquido: number | null
          valor_servicos: number
        }
        Insert: {
          agendamento_id?: string | null
          aliquota_iss?: number | null
          cancelada_em?: string | null
          cancelada_motivo?: string | null
          clinica_id: string
          codigo_verificacao?: string | null
          created_at?: string
          data_emissao?: string
          descricao_servicos?: string | null
          emitente_id?: string | null
          emitida_por?: string | null
          erro_mensagem?: string | null
          focus_ref?: string | null
          focus_status?: string | null
          id?: string
          medico_id?: string | null
          numero?: string | null
          observacoes?: string | null
          orcamento_id?: string | null
          paciente_id?: string | null
          pagamento_id?: string | null
          payload_envio?: Json | null
          payload_resposta?: Json | null
          rps_numero?: number | null
          rps_serie?: string | null
          serie?: string | null
          status?: string
          tomador_documento?: string | null
          tomador_email?: string | null
          tomador_endereco?: Json | null
          tomador_nome?: string | null
          updated_at?: string
          url_pdf?: string | null
          url_xml?: string | null
          valor_iss?: number
          valor_liquido?: number | null
          valor_servicos?: number
        }
        Update: {
          agendamento_id?: string | null
          aliquota_iss?: number | null
          cancelada_em?: string | null
          cancelada_motivo?: string | null
          clinica_id?: string
          codigo_verificacao?: string | null
          created_at?: string
          data_emissao?: string
          descricao_servicos?: string | null
          emitente_id?: string | null
          emitida_por?: string | null
          erro_mensagem?: string | null
          focus_ref?: string | null
          focus_status?: string | null
          id?: string
          medico_id?: string | null
          numero?: string | null
          observacoes?: string | null
          orcamento_id?: string | null
          paciente_id?: string | null
          pagamento_id?: string | null
          payload_envio?: Json | null
          payload_resposta?: Json | null
          rps_numero?: number | null
          rps_serie?: string | null
          serie?: string | null
          status?: string
          tomador_documento?: string | null
          tomador_email?: string | null
          tomador_endereco?: Json | null
          tomador_nome?: string | null
          updated_at?: string
          url_pdf?: string | null
          url_xml?: string | null
          valor_iss?: number
          valor_liquido?: number | null
          valor_servicos?: number
        }
        Relationships: [
          {
            foreignKeyName: "nfse_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_emitente_id_fkey"
            columns: ["emitente_id"]
            isOneToOne: false
            referencedRelation: "nfse_emitentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_emitentes: {
        Row: {
          aliquota_iss: number
          ativo: boolean
          bairro: string
          cep: string
          certificado_pfx_base64: string | null
          certificado_senha: string | null
          certificado_validade: string | null
          clinica_id: string
          cnpj: string
          codigo_cnae: string | null
          codigo_municipio: string
          codigo_tributario_municipio: string | null
          complemento: string | null
          created_at: string
          descricao_servico_padrao: string | null
          email: string | null
          focus_ambiente: string
          focus_token_homologacao: string | null
          focus_token_producao: string | null
          id: string
          incentivador_cultural: boolean
          inscricao_estadual: string | null
          inscricao_municipal: string
          item_lista_servico: string
          logradouro: string
          municipio: string
          nome: string
          nome_fantasia: string | null
          numero: string
          optante_simples: boolean
          padrao: boolean
          razao_social: string
          regime_tributario: string
          rps_proximo_numero: number
          rps_serie: string
          telefone: string | null
          uf: string
          updated_at: string
          usar_ambiente_nacional: boolean
        }
        Insert: {
          aliquota_iss?: number
          ativo?: boolean
          bairro: string
          cep: string
          certificado_pfx_base64?: string | null
          certificado_senha?: string | null
          certificado_validade?: string | null
          clinica_id: string
          cnpj: string
          codigo_cnae?: string | null
          codigo_municipio: string
          codigo_tributario_municipio?: string | null
          complemento?: string | null
          created_at?: string
          descricao_servico_padrao?: string | null
          email?: string | null
          focus_ambiente?: string
          focus_token_homologacao?: string | null
          focus_token_producao?: string | null
          id?: string
          incentivador_cultural?: boolean
          inscricao_estadual?: string | null
          inscricao_municipal: string
          item_lista_servico?: string
          logradouro: string
          municipio: string
          nome: string
          nome_fantasia?: string | null
          numero: string
          optante_simples?: boolean
          padrao?: boolean
          razao_social: string
          regime_tributario?: string
          rps_proximo_numero?: number
          rps_serie?: string
          telefone?: string | null
          uf: string
          updated_at?: string
          usar_ambiente_nacional?: boolean
        }
        Update: {
          aliquota_iss?: number
          ativo?: boolean
          bairro?: string
          cep?: string
          certificado_pfx_base64?: string | null
          certificado_senha?: string | null
          certificado_validade?: string | null
          clinica_id?: string
          cnpj?: string
          codigo_cnae?: string | null
          codigo_municipio?: string
          codigo_tributario_municipio?: string | null
          complemento?: string | null
          created_at?: string
          descricao_servico_padrao?: string | null
          email?: string | null
          focus_ambiente?: string
          focus_token_homologacao?: string | null
          focus_token_producao?: string | null
          id?: string
          incentivador_cultural?: boolean
          inscricao_estadual?: string | null
          inscricao_municipal?: string
          item_lista_servico?: string
          logradouro?: string
          municipio?: string
          nome?: string
          nome_fantasia?: string | null
          numero?: string
          optante_simples?: boolean
          padrao?: boolean
          razao_social?: string
          regime_tributario?: string
          rps_proximo_numero?: number
          rps_serie?: string
          telefone?: string | null
          uf?: string
          updated_at?: string
          usar_ambiente_nacional?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "nfse_emitentes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      odonto_anamnese: {
        Row: {
          alergias: string | null
          bebida_alcoolica: boolean | null
          bruxismo: boolean | null
          cirurgias: string | null
          clinica_id: string
          created_at: string
          doencas: string | null
          em_tratamento_desc: string | null
          em_tratamento_medico: boolean | null
          fumante: boolean | null
          gestante: boolean | null
          id: string
          medicamentos: string | null
          motivo_consulta: string | null
          observacoes: string | null
          paciente_id: string
          respondida_em: string | null
          respondida_por: string | null
          sangramento_gengival: boolean | null
          sensibilidade: boolean | null
          ultima_visita_dentista: string | null
          updated_at: string
        }
        Insert: {
          alergias?: string | null
          bebida_alcoolica?: boolean | null
          bruxismo?: boolean | null
          cirurgias?: string | null
          clinica_id: string
          created_at?: string
          doencas?: string | null
          em_tratamento_desc?: string | null
          em_tratamento_medico?: boolean | null
          fumante?: boolean | null
          gestante?: boolean | null
          id?: string
          medicamentos?: string | null
          motivo_consulta?: string | null
          observacoes?: string | null
          paciente_id: string
          respondida_em?: string | null
          respondida_por?: string | null
          sangramento_gengival?: boolean | null
          sensibilidade?: boolean | null
          ultima_visita_dentista?: string | null
          updated_at?: string
        }
        Update: {
          alergias?: string | null
          bebida_alcoolica?: boolean | null
          bruxismo?: boolean | null
          cirurgias?: string | null
          clinica_id?: string
          created_at?: string
          doencas?: string | null
          em_tratamento_desc?: string | null
          em_tratamento_medico?: boolean | null
          fumante?: boolean | null
          gestante?: boolean | null
          id?: string
          medicamentos?: string | null
          motivo_consulta?: string | null
          observacoes?: string | null
          paciente_id?: string
          respondida_em?: string | null
          respondida_por?: string | null
          sangramento_gengival?: boolean | null
          sensibilidade?: boolean | null
          ultima_visita_dentista?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      odonto_dentes: {
        Row: {
          clinica_id: string
          created_at: string
          data: string
          dente: number
          face: string
          id: string
          observacoes: string | null
          paciente_id: string
          procedimento: string | null
          profissional_id: string | null
          status: Database["public"]["Enums"]["odonto_status"]
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          data?: string
          dente: number
          face?: string
          id?: string
          observacoes?: string | null
          paciente_id: string
          procedimento?: string | null
          profissional_id?: string | null
          status?: Database["public"]["Enums"]["odonto_status"]
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          data?: string
          dente?: number
          face?: string
          id?: string
          observacoes?: string | null
          paciente_id?: string
          procedimento?: string | null
          profissional_id?: string | null
          status?: Database["public"]["Enums"]["odonto_status"]
          updated_at?: string
        }
        Relationships: []
      }
      odonto_evolucoes: {
        Row: {
          agendamento_id: string | null
          anexos: Json | null
          clinica_id: string
          created_at: string
          created_by: string | null
          data: string
          dentes: number[] | null
          descricao: string
          id: string
          paciente_id: string
          procedimento: string | null
          profissional_id: string | null
          titulo: string | null
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          anexos?: Json | null
          clinica_id: string
          created_at?: string
          created_by?: string | null
          data?: string
          dentes?: number[] | null
          descricao: string
          id?: string
          paciente_id: string
          procedimento?: string | null
          profissional_id?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          anexos?: Json | null
          clinica_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          dentes?: number[] | null
          descricao?: string
          id?: string
          paciente_id?: string
          procedimento?: string | null
          profissional_id?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "odonto_evolucoes_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      odonto_imagens: {
        Row: {
          altura: number | null
          categoria: Database["public"]["Enums"]["odonto_imagem_categoria"]
          clinica_id: string
          created_at: string
          criado_por: string | null
          data_exame: string
          deletado_em: string | null
          dentes: number[]
          descricao: string | null
          id: string
          largura: number | null
          mime_type: string
          paciente_id: string
          prontuario_id: string | null
          storage_path: string
          tags: string[]
          tamanho_bytes: number | null
          updated_at: string
        }
        Insert: {
          altura?: number | null
          categoria?: Database["public"]["Enums"]["odonto_imagem_categoria"]
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          data_exame?: string
          deletado_em?: string | null
          dentes?: number[]
          descricao?: string | null
          id?: string
          largura?: number | null
          mime_type: string
          paciente_id: string
          prontuario_id?: string | null
          storage_path: string
          tags?: string[]
          tamanho_bytes?: number | null
          updated_at?: string
        }
        Update: {
          altura?: number | null
          categoria?: Database["public"]["Enums"]["odonto_imagem_categoria"]
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          data_exame?: string
          deletado_em?: string | null
          dentes?: number[]
          descricao?: string | null
          id?: string
          largura?: number | null
          mime_type?: string
          paciente_id?: string
          prontuario_id?: string | null
          storage_path?: string
          tags?: string[]
          tamanho_bytes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "odonto_imagens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odonto_imagens_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odonto_imagens_prontuario_id_fkey"
            columns: ["prontuario_id"]
            isOneToOne: false
            referencedRelation: "odonto_prontuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      odonto_prontuarios: {
        Row: {
          clinica_id: string
          created_at: string
          historia_dental: string | null
          id: string
          observacoes: string | null
          paciente_id: string
          plano_tratamento: string | null
          queixa_principal: string | null
          ultima_atualizacao_por: string | null
          updated_at: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          historia_dental?: string | null
          id?: string
          observacoes?: string | null
          paciente_id: string
          plano_tratamento?: string | null
          queixa_principal?: string | null
          ultima_atualizacao_por?: string | null
          updated_at?: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          historia_dental?: string | null
          id?: string
          observacoes?: string | null
          paciente_id?: string
          plano_tratamento?: string | null
          queixa_principal?: string | null
          ultima_atualizacao_por?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      orcamento_itens: {
        Row: {
          agendado_em: string | null
          agendamento_id: string | null
          cancelado_em: string | null
          concluido_em: string | null
          created_at: string
          dentes: number[] | null
          descricao: string
          fin_atendimento_id: string | null
          id: string
          motivo_nao_aplicavel: string | null
          orcamento_id: string
          ordem: number
          pago_em: string | null
          procedimento_id: string | null
          quantidade: number
          status_alterado_em: string | null
          status_alterado_por: string | null
          status_fin_em: string | null
          status_financeiro: string
          status_item: string
          status_op_em: string | null
          status_operacional: string
          valor_total: number
          valor_unitario: number
          valores_formas: Json | null
        }
        Insert: {
          agendado_em?: string | null
          agendamento_id?: string | null
          cancelado_em?: string | null
          concluido_em?: string | null
          created_at?: string
          dentes?: number[] | null
          descricao: string
          fin_atendimento_id?: string | null
          id?: string
          motivo_nao_aplicavel?: string | null
          orcamento_id: string
          ordem?: number
          pago_em?: string | null
          procedimento_id?: string | null
          quantidade?: number
          status_alterado_em?: string | null
          status_alterado_por?: string | null
          status_fin_em?: string | null
          status_financeiro?: string
          status_item?: string
          status_op_em?: string | null
          status_operacional?: string
          valor_total?: number
          valor_unitario?: number
          valores_formas?: Json | null
        }
        Update: {
          agendado_em?: string | null
          agendamento_id?: string | null
          cancelado_em?: string | null
          concluido_em?: string | null
          created_at?: string
          dentes?: number[] | null
          descricao?: string
          fin_atendimento_id?: string | null
          id?: string
          motivo_nao_aplicavel?: string | null
          orcamento_id?: string
          ordem?: number
          pago_em?: string | null
          procedimento_id?: string | null
          quantidade?: number
          status_alterado_em?: string | null
          status_alterado_por?: string | null
          status_fin_em?: string | null
          status_financeiro?: string
          status_item?: string
          status_op_em?: string | null
          status_operacional?: string
          valor_total?: number
          valor_unitario?: number
          valores_formas?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamento_itens_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_itens_fin_atendimento_id_fkey"
            columns: ["fin_atendimento_id"]
            isOneToOne: false
            referencedRelation: "fin_atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_itens_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos: {
        Row: {
          atualizado_por: string | null
          categoria: string
          clinica_id: string
          clinica_solicitante: string | null
          created_at: string
          criado_por: string | null
          desconto: number
          especialidade_id: string | null
          forma_pagamento: string | null
          id: string
          medico_externo: boolean
          medico_id: string | null
          medico_nome: string | null
          numero: number
          observacoes: string | null
          paciente_id: string | null
          paciente_nome: string
          paciente_telefone: string | null
          status: string
          updated_at: string
          validade_dias: number
          valor_total: number
          valores_pagamento: Json | null
        }
        Insert: {
          atualizado_por?: string | null
          categoria?: string
          clinica_id: string
          clinica_solicitante?: string | null
          created_at?: string
          criado_por?: string | null
          desconto?: number
          especialidade_id?: string | null
          forma_pagamento?: string | null
          id?: string
          medico_externo?: boolean
          medico_id?: string | null
          medico_nome?: string | null
          numero: number
          observacoes?: string | null
          paciente_id?: string | null
          paciente_nome: string
          paciente_telefone?: string | null
          status?: string
          updated_at?: string
          validade_dias?: number
          valor_total?: number
          valores_pagamento?: Json | null
        }
        Update: {
          atualizado_por?: string | null
          categoria?: string
          clinica_id?: string
          clinica_solicitante?: string | null
          created_at?: string
          criado_por?: string | null
          desconto?: number
          especialidade_id?: string | null
          forma_pagamento?: string | null
          id?: string
          medico_externo?: boolean
          medico_id?: string | null
          medico_nome?: string | null
          numero?: number
          observacoes?: string | null
          paciente_id?: string | null
          paciente_nome?: string
          paciente_telefone?: string | null
          status?: string
          updated_at?: string
          validade_dias?: number
          valor_total?: number
          valores_pagamento?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
        ]
      }
      paciente_biometria: {
        Row: {
          clinica_id: string
          consentimento_em: string
          created_at: string
          descriptor: Json
          id: string
          paciente_id: string
          revogado_em: string | null
        }
        Insert: {
          clinica_id: string
          consentimento_em?: string
          created_at?: string
          descriptor: Json
          id?: string
          paciente_id: string
          revogado_em?: string | null
        }
        Update: {
          clinica_id?: string
          consentimento_em?: string
          created_at?: string
          descriptor?: Json
          id?: string
          paciente_id?: string
          revogado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paciente_biometria_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paciente_biometria_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          clinica_id: string
          codigo_prontuario: string | null
          codigo_prontuario_anterior: string | null
          complemento: string | null
          consentimento_lgpd_em: string | null
          cpf: string | null
          cpf_digits: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          estado: string | null
          face_atualizado_em: string | null
          face_descriptor: number[] | null
          foto_atualizado_em: string | null
          foto_url: string | null
          id: string
          legacy_id: number | null
          logradouro: string | null
          nome: string
          numero: string | null
          numero_pasta: string | null
          prontuarios_anteriores: string | null
          responsavel_cpf: string | null
          responsavel_nome: string | null
          responsavel_parentesco: string | null
          responsavel_telefone: string | null
          sexo: string
          telefone: string | null
          telefone2: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id: string
          codigo_prontuario?: string | null
          codigo_prontuario_anterior?: string | null
          complemento?: string | null
          consentimento_lgpd_em?: string | null
          cpf?: string | null
          cpf_digits?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          face_atualizado_em?: string | null
          face_descriptor?: number[] | null
          foto_atualizado_em?: string | null
          foto_url?: string | null
          id?: string
          legacy_id?: number | null
          logradouro?: string | null
          nome: string
          numero?: string | null
          numero_pasta?: string | null
          prontuarios_anteriores?: string | null
          responsavel_cpf?: string | null
          responsavel_nome?: string | null
          responsavel_parentesco?: string | null
          responsavel_telefone?: string | null
          sexo?: string
          telefone?: string | null
          telefone2?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          clinica_id?: string
          codigo_prontuario?: string | null
          codigo_prontuario_anterior?: string | null
          complemento?: string | null
          consentimento_lgpd_em?: string | null
          cpf?: string | null
          cpf_digits?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          face_atualizado_em?: string | null
          face_descriptor?: number[] | null
          foto_atualizado_em?: string | null
          foto_url?: string | null
          id?: string
          legacy_id?: number | null
          logradouro?: string | null
          nome?: string
          numero?: string | null
          numero_pasta?: string | null
          prontuarios_anteriores?: string | null
          responsavel_cpf?: string | null
          responsavel_nome?: string | null
          responsavel_parentesco?: string | null
          responsavel_telefone?: string | null
          sexo?: string
          telefone?: string | null
          telefone2?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamento_splits: {
        Row: {
          beneficiario_tipo: Database["public"]["Enums"]["split_beneficiario_tipo"]
          clinica_id: string
          created_at: string
          emite_nf: boolean
          id: string
          medico_id: string | null
          nfse_id: string | null
          pagamento_id: string
          paytime_recipient_id: string | null
          percentual: number | null
          prestador_id: string | null
          rotulo: string | null
          status: string
          valor: number
        }
        Insert: {
          beneficiario_tipo: Database["public"]["Enums"]["split_beneficiario_tipo"]
          clinica_id: string
          created_at?: string
          emite_nf?: boolean
          id?: string
          medico_id?: string | null
          nfse_id?: string | null
          pagamento_id: string
          paytime_recipient_id?: string | null
          percentual?: number | null
          prestador_id?: string | null
          rotulo?: string | null
          status?: string
          valor: number
        }
        Update: {
          beneficiario_tipo?: Database["public"]["Enums"]["split_beneficiario_tipo"]
          clinica_id?: string
          created_at?: string
          emite_nf?: boolean
          id?: string
          medico_id?: string | null
          nfse_id?: string | null
          pagamento_id?: string
          paytime_recipient_id?: string | null
          percentual?: number | null
          prestador_id?: string | null
          rotulo?: string | null
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamento_splits_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          agendamento_id: string | null
          atendimento_id: string | null
          autorizacao: string | null
          clinica_id: string
          created_at: string
          criado_por: string | null
          forma: Database["public"]["Enums"]["pagamento_forma"]
          id: string
          nsu: string | null
          observacoes: string | null
          paciente_id: string | null
          parcelas: number
          paytime_payload: Json | null
          paytime_transaction_id: string | null
          procedimento_id: string | null
          status: Database["public"]["Enums"]["pagamento_status"]
          updated_at: string
          valor_bruto: number
          valor_liquido: number
          valor_taxa: number
        }
        Insert: {
          agendamento_id?: string | null
          atendimento_id?: string | null
          autorizacao?: string | null
          clinica_id: string
          created_at?: string
          criado_por?: string | null
          forma?: Database["public"]["Enums"]["pagamento_forma"]
          id?: string
          nsu?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          parcelas?: number
          paytime_payload?: Json | null
          paytime_transaction_id?: string | null
          procedimento_id?: string | null
          status?: Database["public"]["Enums"]["pagamento_status"]
          updated_at?: string
          valor_bruto: number
          valor_liquido?: number
          valor_taxa?: number
        }
        Update: {
          agendamento_id?: string | null
          atendimento_id?: string | null
          autorizacao?: string | null
          clinica_id?: string
          created_at?: string
          criado_por?: string | null
          forma?: Database["public"]["Enums"]["pagamento_forma"]
          id?: string
          nsu?: string | null
          observacoes?: string | null
          paciente_id?: string | null
          parcelas?: number
          paytime_payload?: Json | null
          paytime_transaction_id?: string | null
          procedimento_id?: string | null
          status?: Database["public"]["Enums"]["pagamento_status"]
          updated_at?: string
          valor_bruto?: number
          valor_liquido?: number
          valor_taxa?: number
        }
        Relationships: []
      }
      perfil_permissoes: {
        Row: {
          acesso: Database["public"]["Enums"]["modulo_acesso"]
          created_at: string
          id: string
          modulo: string
          perfil_id: string
          updated_at: string
        }
        Insert: {
          acesso?: Database["public"]["Enums"]["modulo_acesso"]
          created_at?: string
          id?: string
          modulo: string
          perfil_id: string
          updated_at?: string
        }
        Update: {
          acesso?: Database["public"]["Enums"]["modulo_acesso"]
          created_at?: string
          id?: string
          modulo?: string
          perfil_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_permissoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_acesso: {
        Row: {
          ativo: boolean
          chave: string
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          sistema: boolean
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          chave: string
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          sistema?: boolean
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          chave?: string
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          sistema?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_acesso_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          chave: string
          created_at: string
          descricao: string
          id: string
          modulo: string
        }
        Insert: {
          chave: string
          created_at?: string
          descricao: string
          id?: string
          modulo: string
        }
        Update: {
          chave?: string
          created_at?: string
          descricao?: string
          id?: string
          modulo?: string
        }
        Relationships: []
      }
      planos_assinatura: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          descricao_beneficios: string | null
          fidelidade_meses: number
          id: string
          max_agregados: number
          max_dependentes: number
          nome: string
          num_parcelas: number
          taxa_adesao: number
          template_contrato: string | null
          tipo: string
          updated_at: string
          valor_mensal: number
          vigencia_meses: number
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          descricao_beneficios?: string | null
          fidelidade_meses?: number
          id?: string
          max_agregados?: number
          max_dependentes?: number
          nome: string
          num_parcelas?: number
          taxa_adesao?: number
          template_contrato?: string | null
          tipo?: string
          updated_at?: string
          valor_mensal?: number
          vigencia_meses?: number
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          descricao_beneficios?: string | null
          fidelidade_meses?: number
          id?: string
          max_agregados?: number
          max_dependentes?: number
          nome?: string
          num_parcelas?: number
          taxa_adesao?: number
          template_contrato?: string | null
          tipo?: string
          updated_at?: string
          valor_mensal?: number
          vigencia_meses?: number
        }
        Relationships: []
      }
      prestadores: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco: string | null
          clinica_id: string
          cnpj: string | null
          conta: string | null
          created_at: string
          email: string | null
          emite_nf_propria: boolean
          id: string
          inscricao_municipal: string | null
          nome: string
          observacoes: string | null
          pix_chave: string | null
          responsavel: string | null
          telefone: string | null
          tipo: Database["public"]["Enums"]["prestador_tipo"]
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          clinica_id: string
          cnpj?: string | null
          conta?: string | null
          created_at?: string
          email?: string | null
          emite_nf_propria?: boolean
          id?: string
          inscricao_municipal?: string | null
          nome: string
          observacoes?: string | null
          pix_chave?: string | null
          responsavel?: string | null
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["prestador_tipo"]
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          clinica_id?: string
          cnpj?: string | null
          conta?: string | null
          created_at?: string
          email?: string | null
          emite_nf_propria?: boolean
          id?: string
          inscricao_municipal?: string | null
          nome?: string
          observacoes?: string | null
          pix_chave?: string | null
          responsavel?: string | null
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["prestador_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      procedimento_cb_convenio_valores: {
        Row: {
          clinica_id: string
          convenio_id: string
          created_at: string
          id: string
          origem: string
          procedimento_id: string
          updated_at: string
          valor_dinheiro: number
          valor_outros: number
        }
        Insert: {
          clinica_id: string
          convenio_id: string
          created_at?: string
          id?: string
          origem?: string
          procedimento_id: string
          updated_at?: string
          valor_dinheiro?: number
          valor_outros?: number
        }
        Update: {
          clinica_id?: string
          convenio_id?: string
          created_at?: string
          id?: string
          origem?: string
          procedimento_id?: string
          updated_at?: string
          valor_dinheiro?: number
          valor_outros?: number
        }
        Relationships: [
          {
            foreignKeyName: "procedimento_cb_convenio_valores_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_cb_convenio_valores_convenio_id_fkey"
            columns: ["convenio_id"]
            isOneToOne: false
            referencedRelation: "cb_convenios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_cb_convenio_valores_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      procedimento_especialidades: {
        Row: {
          clinica_id: string
          created_at: string
          especialidade_id: string
          procedimento_id: string
        }
        Insert: {
          clinica_id: string
          created_at?: string
          especialidade_id: string
          procedimento_id: string
        }
        Update: {
          clinica_id?: string
          created_at?: string
          especialidade_id?: string
          procedimento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedimento_especialidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_especialidades_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_especialidades_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      procedimento_split_regras: {
        Row: {
          ativo: boolean
          beneficiario_tipo: Database["public"]["Enums"]["split_beneficiario_tipo"]
          clinica_id: string
          created_at: string
          emite_nf: boolean
          id: string
          medico_id: string | null
          observacoes: string | null
          ordem: number
          percentual: number | null
          prestador_id: string | null
          procedimento_id: string
          rotulo: string | null
          updated_at: string
          valor_fixo: number | null
        }
        Insert: {
          ativo?: boolean
          beneficiario_tipo: Database["public"]["Enums"]["split_beneficiario_tipo"]
          clinica_id: string
          created_at?: string
          emite_nf?: boolean
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          ordem?: number
          percentual?: number | null
          prestador_id?: string | null
          procedimento_id: string
          rotulo?: string | null
          updated_at?: string
          valor_fixo?: number | null
        }
        Update: {
          ativo?: boolean
          beneficiario_tipo?: Database["public"]["Enums"]["split_beneficiario_tipo"]
          clinica_id?: string
          created_at?: string
          emite_nf?: boolean
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          ordem?: number
          percentual?: number | null
          prestador_id?: string | null
          procedimento_id?: string
          rotulo?: string | null
          updated_at?: string
          valor_fixo?: number | null
        }
        Relationships: []
      }
      procedimento_unidade_regras: {
        Row: {
          agenda_obrigatoria: boolean | null
          clinica_id: string
          cor_agenda: string | null
          created_at: string
          equipamento_obrigatorio: boolean | null
          exige_autorizacao: boolean | null
          exige_preparo: boolean | null
          exige_termo: boolean | null
          fluxo_atendimento: string | null
          id: string
          medico_obrigatorio: boolean | null
          permite_encaixe: boolean | null
          permite_orcamento: boolean | null
          permite_venda_direta: boolean | null
          procedimento_id: string
          sala_obrigatoria: boolean | null
          tempo_padrao_min: number | null
          tipo_procedimento: string | null
          unidade_id: string
          updated_at: string
        }
        Insert: {
          agenda_obrigatoria?: boolean | null
          clinica_id: string
          cor_agenda?: string | null
          created_at?: string
          equipamento_obrigatorio?: boolean | null
          exige_autorizacao?: boolean | null
          exige_preparo?: boolean | null
          exige_termo?: boolean | null
          fluxo_atendimento?: string | null
          id?: string
          medico_obrigatorio?: boolean | null
          permite_encaixe?: boolean | null
          permite_orcamento?: boolean | null
          permite_venda_direta?: boolean | null
          procedimento_id: string
          sala_obrigatoria?: boolean | null
          tempo_padrao_min?: number | null
          tipo_procedimento?: string | null
          unidade_id: string
          updated_at?: string
        }
        Update: {
          agenda_obrigatoria?: boolean | null
          clinica_id?: string
          cor_agenda?: string | null
          created_at?: string
          equipamento_obrigatorio?: boolean | null
          exige_autorizacao?: boolean | null
          exige_preparo?: boolean | null
          exige_termo?: boolean | null
          fluxo_atendimento?: string | null
          id?: string
          medico_obrigatorio?: boolean | null
          permite_encaixe?: boolean | null
          permite_orcamento?: boolean | null
          permite_venda_direta?: boolean | null
          procedimento_id?: string
          sala_obrigatoria?: boolean | null
          tempo_padrao_min?: number | null
          tipo_procedimento?: string | null
          unidade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedimento_unidade_regras_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_unidade_regras_procedimento_id_fkey"
            columns: ["procedimento_id"]
            isOneToOne: false
            referencedRelation: "procedimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedimento_unidade_regras_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      procedimentos: {
        Row: {
          agenda_obrigatoria: boolean
          ativo: boolean
          clinica_id: string
          codigo: string | null
          cor_agenda: string | null
          created_at: string
          duracao_minutos: number
          equipamento_obrigatorio: boolean
          exige_autorizacao: boolean
          exige_preparo: boolean
          exige_termo: boolean
          fluxo_atendimento: string | null
          grupo: string | null
          id: string
          medico_obrigatorio: boolean
          nome: string
          observacoes: string | null
          permite_encaixe: boolean
          permite_orcamento: boolean
          permite_venda_direta: boolean
          preparo: string | null
          requer_laudo: boolean
          requer_medico: boolean
          requer_sala: boolean
          sala_obrigatoria: boolean
          tempo_padrao_min: number
          tipo: string
          tipo_destino: string | null
          tipo_procedimento: string | null
          tipo_recurso: string | null
          updated_at: string
          valor_cartao: number
          valor_cartao_consulta: number
          valor_cartao_credito: number
          valor_cartao_debito: number
          valor_cartao_desconto: number
          valor_dinheiro: number
          valor_dinheiro_pix: number
          valor_padrao: number
          valor_pix: number
          valor_variavel: boolean
        }
        Insert: {
          agenda_obrigatoria?: boolean
          ativo?: boolean
          clinica_id: string
          codigo?: string | null
          cor_agenda?: string | null
          created_at?: string
          duracao_minutos?: number
          equipamento_obrigatorio?: boolean
          exige_autorizacao?: boolean
          exige_preparo?: boolean
          exige_termo?: boolean
          fluxo_atendimento?: string | null
          grupo?: string | null
          id?: string
          medico_obrigatorio?: boolean
          nome: string
          observacoes?: string | null
          permite_encaixe?: boolean
          permite_orcamento?: boolean
          permite_venda_direta?: boolean
          preparo?: string | null
          requer_laudo?: boolean
          requer_medico?: boolean
          requer_sala?: boolean
          sala_obrigatoria?: boolean
          tempo_padrao_min?: number
          tipo?: string
          tipo_destino?: string | null
          tipo_procedimento?: string | null
          tipo_recurso?: string | null
          updated_at?: string
          valor_cartao?: number
          valor_cartao_consulta?: number
          valor_cartao_credito?: number
          valor_cartao_debito?: number
          valor_cartao_desconto?: number
          valor_dinheiro?: number
          valor_dinheiro_pix?: number
          valor_padrao?: number
          valor_pix?: number
          valor_variavel?: boolean
        }
        Update: {
          agenda_obrigatoria?: boolean
          ativo?: boolean
          clinica_id?: string
          codigo?: string | null
          cor_agenda?: string | null
          created_at?: string
          duracao_minutos?: number
          equipamento_obrigatorio?: boolean
          exige_autorizacao?: boolean
          exige_preparo?: boolean
          exige_termo?: boolean
          fluxo_atendimento?: string | null
          grupo?: string | null
          id?: string
          medico_obrigatorio?: boolean
          nome?: string
          observacoes?: string | null
          permite_encaixe?: boolean
          permite_orcamento?: boolean
          permite_venda_direta?: boolean
          preparo?: string | null
          requer_laudo?: boolean
          requer_medico?: boolean
          requer_sala?: boolean
          sala_obrigatoria?: boolean
          tempo_padrao_min?: number
          tipo?: string
          tipo_destino?: string | null
          tipo_procedimento?: string | null
          tipo_recurso?: string | null
          updated_at?: string
          valor_cartao?: number
          valor_cartao_consulta?: number
          valor_cartao_credito?: number
          valor_cartao_debito?: number
          valor_cartao_desconto?: number
          valor_dinheiro?: number
          valor_dinheiro_pix?: number
          valor_padrao?: number
          valor_pix?: number
          valor_variavel?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          nome: string
          preferencias_ui: Json
          telefone: string | null
          telefone2: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          nome: string
          preferencias_ui?: Json
          telefone?: string | null
          telefone2?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          nome?: string
          preferencias_ui?: Json
          telefone?: string | null
          telefone2?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prontuario_modelos: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          especialidade_id: string | null
          id: string
          nome: string
          prompt_ia: string | null
          secoes: Json
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          especialidade_id?: string | null
          id?: string
          nome: string
          prompt_ia?: string | null
          secoes?: Json
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          especialidade_id?: string | null
          id?: string
          nome?: string
          prompt_ia?: string | null
          secoes?: Json
          updated_at?: string
        }
        Relationships: []
      }
      prontuarios: {
        Row: {
          agendamento_id: string | null
          clinica_id: string
          conduta: string | null
          created_at: string
          data: string
          exame_fisico: string | null
          hipotese_diagnostica: string | null
          historia_doenca: string | null
          id: string
          medico_id: string | null
          observacoes: string | null
          paciente_id: string
          prescricao: string | null
          queixa_principal: string | null
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          clinica_id: string
          conduta?: string | null
          created_at?: string
          data?: string
          exame_fisico?: string | null
          hipotese_diagnostica?: string | null
          historia_doenca?: string | null
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          paciente_id: string
          prescricao?: string | null
          queixa_principal?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          clinica_id?: string
          conduta?: string | null
          created_at?: string
          data?: string
          exame_fisico?: string | null
          hipotese_diagnostica?: string | null
          historia_doenca?: string | null
          id?: string
          medico_id?: string | null
          observacoes?: string | null
          paciente_id?: string
          prescricao?: string | null
          queixa_principal?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prontuarios_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      regras_rateio: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          especialidade_id: string | null
          forma_pagamento: Database["public"]["Enums"]["forma_pagamento"] | null
          id: string
          medico_id: string | null
          nome: string
          observacoes: string | null
          percentual_clinica: number
          percentual_medico: number
          prioridade: number
          procedimento: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          especialidade_id?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          id?: string
          medico_id?: string | null
          nome: string
          observacoes?: string | null
          percentual_clinica: number
          percentual_medico: number
          prioridade?: number
          procedimento?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          especialidade_id?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["forma_pagamento"]
            | null
          id?: string
          medico_id?: string | null
          nome?: string
          observacoes?: string | null
          percentual_clinica?: number
          percentual_medico?: number
          prioridade?: number
          procedimento?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regras_rateio_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_rateio_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_rateio_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          cargo_id: string
          clinica_id: string
          created_at: string
          id: string
          permission_id: string
        }
        Insert: {
          cargo_id: string
          clinica_id: string
          created_at?: string
          id?: string
          permission_id: string
        }
        Update: {
          cargo_id?: string
          clinica_id?: string
          created_at?: string
          id?: string
          permission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      senhas: {
        Row: {
          atendida_em: string | null
          cancelada_em: string | null
          chamada_em: string | null
          chamada_por: string | null
          clinica_id: string
          codigo: string
          data_dia: string
          emitida_em: string
          guiche: string | null
          id: string
          identificado_por_facial: boolean
          numero: number
          paciente_id: string | null
          status: Database["public"]["Enums"]["status_senha"]
          tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        Insert: {
          atendida_em?: string | null
          cancelada_em?: string | null
          chamada_em?: string | null
          chamada_por?: string | null
          clinica_id: string
          codigo: string
          data_dia?: string
          emitida_em?: string
          guiche?: string | null
          id?: string
          identificado_por_facial?: boolean
          numero: number
          paciente_id?: string | null
          status?: Database["public"]["Enums"]["status_senha"]
          tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        Update: {
          atendida_em?: string | null
          cancelada_em?: string | null
          chamada_em?: string | null
          chamada_por?: string | null
          clinica_id?: string
          codigo?: string
          data_dia?: string
          emitida_em?: string
          guiche?: string | null
          id?: string
          identificado_por_facial?: boolean
          numero?: number
          paciente_id?: string | null
          status?: Database["public"]["Enums"]["status_senha"]
          tipo?: Database["public"]["Enums"]["tipo_senha"]
        }
        Relationships: [
          {
            foreignKeyName: "senhas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "senhas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      setores: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          responsavel_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          responsavel_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          responsavel_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setores_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      sistema_planos: {
        Row: {
          ativo: boolean
          codigo_plano: number
          created_at: string
          data: string
          descricao: string
          id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_plano: number
          created_at?: string
          data?: string
          descricao: string
          id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_plano?: number
          created_at?: string
          data?: string
          descricao?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tipos_servico: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      triagens_enfermagem: {
        Row: {
          agendamento_id: string | null
          alergias: string | null
          altura_cm: number | null
          clinica_id: string
          created_at: string
          doencas: string[] | null
          enfermeira_id: string | null
          enfermeira_nome: string | null
          freq_cardiaca: number | null
          glicemia: number | null
          id: string
          imc: number | null
          medicamentos: string | null
          motivo_prioridade: string | null
          observacoes: string | null
          pa_diastolica: number | null
          pa_sistolica: number | null
          paciente_id: string | null
          peso_kg: number | null
          prioridade: string | null
          queixa_principal: string | null
          saturacao: number | null
          temperatura: number | null
          updated_at: string
        }
        Insert: {
          agendamento_id?: string | null
          alergias?: string | null
          altura_cm?: number | null
          clinica_id: string
          created_at?: string
          doencas?: string[] | null
          enfermeira_id?: string | null
          enfermeira_nome?: string | null
          freq_cardiaca?: number | null
          glicemia?: number | null
          id?: string
          imc?: number | null
          medicamentos?: string | null
          motivo_prioridade?: string | null
          observacoes?: string | null
          pa_diastolica?: number | null
          pa_sistolica?: number | null
          paciente_id?: string | null
          peso_kg?: number | null
          prioridade?: string | null
          queixa_principal?: string | null
          saturacao?: number | null
          temperatura?: number | null
          updated_at?: string
        }
        Update: {
          agendamento_id?: string | null
          alergias?: string | null
          altura_cm?: number | null
          clinica_id?: string
          created_at?: string
          doencas?: string[] | null
          enfermeira_id?: string | null
          enfermeira_nome?: string | null
          freq_cardiaca?: number | null
          glicemia?: number | null
          id?: string
          imc?: number | null
          medicamentos?: string | null
          motivo_prioridade?: string | null
          observacoes?: string | null
          pa_diastolica?: number | null
          pa_sistolica?: number | null
          paciente_id?: string | null
          peso_kg?: number | null
          prioridade?: string | null
          queixa_principal?: string | null
          saturacao?: number | null
          temperatura?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      unidades: {
        Row: {
          ativo: boolean
          cep: string | null
          cidade: string | null
          clinica_id: string
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          raio_metros: number | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          clinica_id: string
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          raio_metros?: number | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          clinica_id?: string
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          raio_metros?: number | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidades_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          clinica_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role_global"]
          user_id: string
        }
        Insert: {
          clinica_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role_global"]
          user_id: string
        }
        Update: {
          clinica_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role_global"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_configs: {
        Row: {
          access_token: string | null
          app_secret: string | null
          ativo: boolean
          clinica_id: string
          created_at: string
          display_name: string | null
          display_phone_number: string | null
          horario_fim: string | null
          horario_inicio: string | null
          phone_number_id: string | null
          ultimo_teste_em: string | null
          ultimo_teste_erro: string | null
          ultimo_teste_ok: boolean | null
          updated_at: string
          verify_token: string
          waba_id: string | null
          welcome_message: string | null
        }
        Insert: {
          access_token?: string | null
          app_secret?: string | null
          ativo?: boolean
          clinica_id: string
          created_at?: string
          display_name?: string | null
          display_phone_number?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          phone_number_id?: string | null
          ultimo_teste_em?: string | null
          ultimo_teste_erro?: string | null
          ultimo_teste_ok?: boolean | null
          updated_at?: string
          verify_token?: string
          waba_id?: string | null
          welcome_message?: string | null
        }
        Update: {
          access_token?: string | null
          app_secret?: string | null
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          display_name?: string | null
          display_phone_number?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          phone_number_id?: string | null
          ultimo_teste_em?: string | null
          ultimo_teste_erro?: string | null
          ultimo_teste_ok?: boolean | null
          updated_at?: string
          verify_token?: string
          waba_id?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_configs_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: true
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensagens: {
        Row: {
          body: string | null
          canal: string
          clinica_id: string
          conversa_id: string | null
          created_at: string
          direction: string
          enviada_por: string | null
          from_number: string | null
          id: string
          media_mime: string | null
          media_url: string | null
          quoted_message_id: string | null
          raw: Json | null
          read_at: string | null
          recebida_em: string
          status: string | null
          tipo: string
          to_number: string | null
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          canal?: string
          clinica_id: string
          conversa_id?: string | null
          created_at?: string
          direction: string
          enviada_por?: string | null
          from_number?: string | null
          id?: string
          media_mime?: string | null
          media_url?: string | null
          quoted_message_id?: string | null
          raw?: Json | null
          read_at?: string | null
          recebida_em?: string
          status?: string | null
          tipo?: string
          to_number?: string | null
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          canal?: string
          clinica_id?: string
          conversa_id?: string | null
          created_at?: string
          direction?: string
          enviada_por?: string | null
          from_number?: string | null
          id?: string
          media_mime?: string | null
          media_url?: string | null
          quoted_message_id?: string | null
          raw?: Json | null
          read_at?: string | null
          recebida_em?: string
          status?: string | null
          tipo?: string
          to_number?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "atend_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          evento: string
          id: string
          mensagem: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          evento: string
          id?: string
          mensagem: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          evento?: string
          id?: string
          mensagem?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_pacientes_duplicados_suspeitos: {
        Row: {
          chave: string | null
          clinica_id: string | null
          ids: string[] | null
          qtd: number | null
          tipo: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _do_fix_phones_prontuarios_mj: {
        Args: never
        Returns: {
          atualizados: number
        }[]
      }
      _do_fix_prontuario_oldest_mj: {
        Args: never
        Returns: {
          atualizados: number
        }[]
      }
      _do_import_pacientes_mj: { Args: never; Returns: number }
      _do_merge_pacientes_dup_mj: {
        Args: never
        Returns: {
          grupos: number
          mesclados: number
        }[]
      }
      _mj_apply_batch: { Args: { p_limit?: number }; Returns: number }
      _mj_null_all: { Args: never; Returns: number }
      _mj_set_batch: { Args: { _limit?: number }; Returns: number }
      _mj_tmp_batch: { Args: { _limit?: number }; Returns: number }
      assinar_contrato_publico: {
        Args: { _assinatura_svg: string; _ip: string; _token: string }
        Returns: string
      }
      atend_gerar_protocolo: { Args: { _clinica_id: string }; Returns: string }
      buscar_paciente_contato: {
        Args: {
          _clinica_id: string
          _cpf?: string
          _nome?: string
          _telefone?: string
        }
        Returns: {
          associado: boolean
          contrato_id: string
          convenio_id: string
          convenio_nome: string
          cpf: string
          data_nascimento: string
          id: string
          nome: string
          telefone: string
        }[]
      }
      buscar_pacientes: {
        Args: { _clinica_id: string; _limit?: number; _termo: string }
        Returns: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          clinica_id: string
          codigo_prontuario: string | null
          codigo_prontuario_anterior: string | null
          complemento: string | null
          consentimento_lgpd_em: string | null
          cpf: string | null
          cpf_digits: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          estado: string | null
          face_atualizado_em: string | null
          face_descriptor: number[] | null
          foto_atualizado_em: string | null
          foto_url: string | null
          id: string
          legacy_id: number | null
          logradouro: string | null
          nome: string
          numero: string | null
          numero_pasta: string | null
          prontuarios_anteriores: string | null
          responsavel_cpf: string | null
          responsavel_nome: string | null
          responsavel_parentesco: string | null
          responsavel_telefone: string | null
          sexo: string
          telefone: string | null
          telefone2: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pacientes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      buscar_pacientes_agenda: {
        Args: { _clinica_ids: string[]; _limite?: number; _termo: string }
        Returns: {
          clinica_id: string
          codigo_prontuario: string
          cpf: string
          data_nascimento: string
          id: string
          nome: string
          numero_pasta: string
          telefone: string
        }[]
      }
      buscar_pacientes_global: {
        Args: { _clinica_ids: string[]; _limite?: number; _termo: string }
        Returns: {
          associado_convenio: string
          associado_tipo: string
          cadastro_incompleto: boolean
          clinica_id: string
          codigo_prontuario: string
          codigo_prontuario_anterior: string
          cpf: string
          data_nascimento: string
          email: string
          id: string
          match_reason: string
          match_score: number
          nome: string
          numero_pasta: string
          telefone: string
          ultima_consulta: string
        }[]
      }
      buscar_universal: {
        Args: {
          _clinica_ids: string[]
          _limite?: number
          _termo: string
          _tipos?: string[]
        }
        Returns: {
          criado_em: string
          hint: string
          id: string
          payload: Json
          score: number
          subtitulo: string
          tipo: string
          titulo: string
        }[]
      }
      can_manage_clinica: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_medicos: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      cancelar_item: {
        Args: {
          p_confirmar_cascata?: boolean
          p_item_id: string
          p_motivo: string
        }
        Returns: Json
      }
      chamar_proxima_senha: {
        Args: { _clinica_id: string; _guiche: string }
        Returns: {
          atendida_em: string | null
          cancelada_em: string | null
          chamada_em: string | null
          chamada_por: string | null
          clinica_id: string
          codigo: string
          data_dia: string
          emitida_em: string
          guiche: string | null
          id: string
          identificado_por_facial: boolean
          numero: number
          paciente_id: string | null
          status: Database["public"]["Enums"]["status_senha"]
          tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        SetofOptions: {
          from: "*"
          to: "senhas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      chamar_proxima_senha_tipo: {
        Args: {
          _clinica_id: string
          _guiche: string
          _tipo?: Database["public"]["Enums"]["tipo_senha"]
        }
        Returns: {
          atendida_em: string | null
          cancelada_em: string | null
          chamada_em: string | null
          chamada_por: string | null
          clinica_id: string
          codigo: string
          data_dia: string
          emitida_em: string
          guiche: string | null
          id: string
          identificado_por_facial: boolean
          numero: number
          paciente_id: string | null
          status: Database["public"]["Enums"]["status_senha"]
          tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        SetofOptions: {
          from: "*"
          to: "senhas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      checkin_agendamento: { Args: { _token: string }; Returns: Json }
      consulta_publica: { Args: { _token: string }; Returns: Json }
      contrato_dias_tolerancia: { Args: never; Returns: number }
      contrato_historico: { Args: { _contrato_id: string }; Returns: Json }
      contrato_publico: { Args: { _token: string }; Returns: Json }
      converter_item_agendamento: {
        Args: { p_item_id: string; p_payload: Json }
        Returns: Json
      }
      converter_item_venda: {
        Args: {
          p_caixa_sessao_id: string
          p_desconto?: number
          p_forma_pagamento: string
          p_item_id: string
        }
        Returns: Json
      }
      criar_clinica_com_admin: {
        Args: {
          _cidade?: string
          _cnpj?: string
          _estado?: string
          _nome: string
          _telefone?: string
        }
        Returns: string
      }
      criar_contrato_assinatura: {
        Args: {
          _clinica_id: string
          _convenio_id: string
          _criado_por: string
          _data_fim: string
          _data_inicio: string
          _dependentes: Json
          _dia_vencimento: number
          _forma_pagamento: string
          _mensalidades: Json
          _num_parcelas: number
          _observacoes: string
          _paciente_id: string
          _paciente_nome: string
          _taxa_adesao: number
          _valor_mensal: number
        }
        Returns: Json
      }
      cubo_bi_financeiro_agregado: {
        Args: {
          _clinica_id: string
          _col_key?: string
          _fim: string
          _ini: string
          _measure_agg?: string
          _measure_field?: string
          _row_key: string
          _sub_row_key?: string
          _sub_sub_row_key?: string
        }
        Returns: {
          col_value: string
          row_value: string
          sub_row_value: string
          sub_sub_row_value: string
          valor: number
        }[]
      }
      each: { Args: { hs: unknown }; Returns: Record<string, unknown>[] }
      emitir_nfse_orcamento: { Args: { p_orcamento_id: string }; Returns: Json }
      emitir_senha: {
        Args: {
          _clinica_id: string
          _identificado_facial?: boolean
          _paciente_id?: string
          _tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        Returns: {
          atendida_em: string | null
          cancelada_em: string | null
          chamada_em: string | null
          chamada_por: string | null
          clinica_id: string
          codigo: string
          data_dia: string
          emitida_em: string
          guiche: string | null
          id: string
          identificado_por_facial: boolean
          numero: number
          paciente_id: string | null
          status: Database["public"]["Enums"]["status_senha"]
          tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        SetofOptions: {
          from: "*"
          to: "senhas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      emitir_senha_publica: {
        Args: {
          _clinica_id: string
          _tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        Returns: {
          atendida_em: string | null
          cancelada_em: string | null
          chamada_em: string | null
          chamada_por: string | null
          clinica_id: string
          codigo: string
          data_dia: string
          emitida_em: string
          guiche: string | null
          id: string
          identificado_por_facial: boolean
          numero: number
          paciente_id: string | null
          status: Database["public"]["Enums"]["status_senha"]
          tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        SetofOptions: {
          from: "*"
          to: "senhas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      estornar_lancamento_receita: {
        Args: { _clinica_id: string; _lancamento_id: string }
        Returns: Json
      }
      feature_flag_ativa: {
        Args: { _clinica_id: string; _flag_key: string }
        Returns: boolean
      }
      fila_caixa_hoje: {
        Args: { _clinica_id: string; _data?: string }
        Returns: {
          desconto_origem: string
          id: string
          inicio: string
          ja_pago: boolean
          medico_nome: string
          paciente_id: string
          paciente_nome: string
          procedimento: string
          valor: number
          valor_cartao: number
        }[]
      }
      fin_atendimentos_matriz: {
        Args: { _clinica: string }
        Returns: {
          ano: number
          cartao: number
          exames: number
          mes: number
          particular: number
        }[]
      }
      fin_resumo_categoria: {
        Args: {
          p_clinica: string
          p_fim: string
          p_ini: string
          p_status?: string
        }
        Returns: {
          categoria_id: string
          tipo: string
          total: number
        }[]
      }
      fin_resumo_periodo: {
        Args: { p_clinica: string; p_fim: string; p_ini: string }
        Returns: {
          qtd: number
          status: string
          tipo: string
          total: number
        }[]
      }
      fin_serie_diaria: {
        Args: {
          p_clinica: string
          p_fim: string
          p_ini: string
          p_status?: string
        }
        Returns: {
          data: string
          tipo: string
          total: number
        }[]
      }
      finalizar_pagamento_agrupado: {
        Args: {
          _clinica_id: string
          _criado_por: string
          _forma_pagamento: string
          _grupo_id: string
          _itens: Json
        }
        Returns: Json
      }
      fn_registrar_lancamento_e_caixa: {
        Args: { p_lancamento: Json; p_movimento?: Json }
        Returns: Json
      }
      fn_regras_procedimento: {
        Args: { p_procedimento_id: string; p_unidade_id?: string }
        Returns: Json
      }
      get_horarios_disponiveis: {
        Args: {
          _clinica_id: string
          _dias?: number
          _especialidade_id?: string
          _limite?: number
          _medico_id?: string
        }
        Returns: {
          agenda_id: string
          agenda_nome: string
          capacidade: number
          especialidade_id: string
          especialidade_nome: string
          fim: string
          inicio: string
          medico_id: string
          medico_nome: string
          ocupados: number
        }[]
      }
      get_orcamento_conversao: {
        Args: { p_orcamento_id: string }
        Returns: Json
      }
      get_ultimo_agendamento_paciente: {
        Args: { _paciente_id: string }
        Returns: {
          clinica_id: string
          especialidade_id: string
          especialidade_nome: string
          inicio: string
          medico_id: string
          medico_nome: string
          procedimento: string
        }[]
      }
      has_role: {
        Args: {
          _clinica_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_global: {
        Args: {
          _clinica_id?: string
          _role: Database["public"]["Enums"]["app_role_global"]
          _user_id: string
        }
        Returns: boolean
      }
      is_chat_member: {
        Args: { _canal_id: string; _user_id: string }
        Returns: boolean
      }
      is_financeiro_clinica: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      is_medico: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      is_member: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      kpis_clientes_v2: {
        Args: { _clinica_id: string }
        Returns: {
          aniversariantes: number
          associados: number
          ativos: number
          inativos: number
          novos30d: number
          sem_cpf: number
          sem_telefone: number
          total: number
        }[]
      }
      listar_duplicados_pacientes: {
        Args: { _clinica_ids: string[]; _limite?: number; _tipo?: string }
        Returns: {
          chave: string
          clinica_id: string
          ids: string[]
          pacientes: Json
          qtd: number
          tipo: string
        }[]
      }
      log_action: {
        Args: {
          _action: string
          _clinica_id?: string
          _dados_antes?: Json
          _dados_depois?: Json
          _record_id: string
          _table_name: string
        }
        Returns: undefined
      }
      marcar_item_nao_aplicavel: {
        Args: { p_item_id: string; p_motivo: string }
        Returns: Json
      }
      medico_dados_sensiveis: { Args: { _medico_id: string }; Returns: Json }
      medicos_face_lista: {
        Args: { _clinica_id: string }
        Returns: {
          descriptor: Json
          email: string
          medico_id: string
          nome: string
          user_id: string
        }[]
      }
      medicos_repasse_lista: {
        Args: { _clinica_id: string }
        Returns: {
          id: string
          percentual_repasse_padrao: number
          tipo_repasse: string
          valor_repasse_padrao: number
        }[]
      }
      merge_pacientes: { Args: { _ids: string[] }; Returns: string }
      meus_cartoes: { Args: never; Returns: Json }
      minhas_consultas: {
        Args: never
        Returns: {
          clinica_nome: string
          fim: string
          id: string
          inicio: string
          medico_especialidade: string
          medico_nome: string
          paciente_nome: string
          procedimento: string
          status: Database["public"]["Enums"]["agendamento_status"]
          teleconsulta: boolean
          token_publico: string
        }[]
      }
      paciente_cartao_inadimplente: {
        Args: { _clinica_id: string; _paciente_id: string }
        Returns: Json
      }
      paciente_cartao_status: {
        Args: { _clinica_id: string; _paciente_id: string }
        Returns: Json
      }
      paciente_pendencias_cadastro: {
        Args: { _paciente_id: string }
        Returns: {
          contato_ok: boolean
          documentacao_ok: boolean
          endereco_ok: boolean
          faltantes: string[]
          nfse_ok: boolean
        }[]
      }
      paciente_resumo_recepcao: {
        Args: { _clinica_id: string; _paciente_id: string }
        Returns: {
          cadastro_incompleto: boolean
          convenio_nome: string
          empresa_nome: string
          faltantes: string[]
          idade: number
          nome: string
          paciente_id: string
          pendencia_qtd: number
          pendencia_valor: number
          telefone: string
          tipo: string
          ultima_consulta_data: string
          ultima_consulta_especialidade: string
          ultima_consulta_medico: string
          ultimo_exame_data: string
          ultimo_exame_nome: string
          whatsapp_valido: boolean
        }[]
      }
      pacientes_aniversariantes_hoje: {
        Args: { _clinica_id: string; _limite?: number }
        Returns: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          clinica_id: string
          codigo_prontuario: string | null
          codigo_prontuario_anterior: string | null
          complemento: string | null
          consentimento_lgpd_em: string | null
          cpf: string | null
          cpf_digits: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          estado: string | null
          face_atualizado_em: string | null
          face_descriptor: number[] | null
          foto_atualizado_em: string | null
          foto_url: string | null
          id: string
          legacy_id: number | null
          logradouro: string | null
          nome: string
          numero: string | null
          numero_pasta: string | null
          prontuarios_anteriores: string | null
          responsavel_cpf: string | null
          responsavel_nome: string | null
          responsavel_parentesco: string | null
          responsavel_telefone: string | null
          sexo: string
          telefone: string | null
          telefone2: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pacientes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      pacientes_face_lista: {
        Args: { _clinica_id: string }
        Returns: {
          descriptor: Json
          id: string
          nome: string
        }[]
      }
      pagar_repasse_medico: {
        Args: {
          _agenda_ids: string[]
          _clinica_id: string
          _conta_id: string
          _criado_por: string
          _data: string
          _forma_pagamento: string
          _manual_ids: string[]
          _medico_id: string
          _medico_nome: string
          _total: number
        }
        Returns: string
      }
      painel_senhas_publicas: {
        Args: { _clinica_id: string }
        Returns: {
          chamada_em: string
          codigo: string
          guiche: string
          id: string
          paciente_id: string
          paciente_nome: string
          status: string
          tipo: string
        }[]
      }
      pendencias_paciente: { Args: { _paciente_id: string }; Returns: Json }
      procedimentos_popularidade: {
        Args: { p_clinica_id: string }
        Returns: {
          procedimento: string
          total: number
        }[]
      }
      reagendar_atendimento: {
        Args: { _destino_id: string; _origem_id: string; _trilha_msg: string }
        Returns: Json
      }
      rechamar_senha: {
        Args: { _id: string }
        Returns: {
          atendida_em: string | null
          cancelada_em: string | null
          chamada_em: string | null
          chamada_por: string | null
          clinica_id: string
          codigo: string
          data_dia: string
          emitida_em: string
          guiche: string | null
          id: string
          identificado_por_facial: boolean
          numero: number
          paciente_id: string | null
          status: Database["public"]["Enums"]["status_senha"]
          tipo: Database["public"]["Enums"]["tipo_senha"]
        }
        SetofOptions: {
          from: "*"
          to: "senhas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      renovar_contrato_extensao: {
        Args: {
          _contrato_id: string
          _data_renovacao?: string
          _dependentes?: Json
          _observacao?: string
          _valor_mensal?: number
        }
        Returns: Json
      }
      renovar_contrato_troca_plano: {
        Args: {
          _cobrar_taxa_adesao?: boolean
          _contrato_id: string
          _convenio_novo_id: string
          _data_renovacao?: string
          _dependentes?: Json
          _observacao?: string
          _valor_mensal?: number
        }
        Returns: Json
      }
      resolver_clinica_por_token: {
        Args: { _token: string }
        Returns: {
          base_importada: boolean
          branding: Json
          cidade: string
          estado: string
          id: string
          nome: string
        }[]
      }
      resolver_clinica_publica: {
        Args: { _clinica_id: string }
        Returns: {
          base_importada: boolean
          branding: Json
          cidade: string
          estado: string
          id: string
          nome: string
        }[]
      }
      salvar_agendamento_e_vincular_orcamento: {
        Args: {
          _clinica_id: string
          _data_pagamento: string
          _editing_id: string
          _especialidade_id: string
          _fim: string
          _forma_pagamento_prevista: string
          _inicio: string
          _medico_id: string
          _observacoes: string
          _orcamento_id: string
          _orcamento_item_ids: string[]
          _paciente_id: string
          _paciente_nome: string
          _paciente_nome_esperado_no_slot: string
          _procedimento: string
          _status: string
          _tipo_atendimento: string
        }
        Returns: Json
      }
      salvar_agendamento_multi_imagem: {
        Args: {
          _clinica_id: string
          _data_pagamento: string
          _editing_id: string
          _especialidade_id: string
          _fim: string
          _forma_pagamento_prevista: string
          _grupo_id: string
          _inicio: string
          _medico_id: string
          _observacoes: string
          _orcamento_id: string
          _orcamento_item_ids?: string[]
          _paciente_id: string
          _paciente_nome: string
          _paciente_nome_esperado_no_slot: string
          _procedimentos: string[]
          _status: string
          _tipo_atendimento: string
        }
        Returns: Json
      }
      salvar_anamnese_publica: {
        Args: { _modelo_id: string; _respostas: Json; _token: string }
        Returns: string
      }
      seed_prontuario_modelos_padrao: {
        Args: { _clinica_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      strip_accents: { Args: { _text: string }; Returns: string }
      top_procedimentos_agendamento: {
        Args: {
          _clinica_id: string
          _especialidade_id?: string
          _janela_dias?: number
          _limit?: number
          _tipo?: string
        }
        Returns: {
          grupo: string
          nome: string
          procedimento_id: string
          quantidade: number
          tipo: string
          ultimo_uso: string
        }[]
      }
      totem_checkin_cpf: {
        Args: { _clinica_id: string; _cpf: string }
        Returns: Json
      }
      totem_checkin_paciente: {
        Args: { _clinica_id: string; _paciente_id: string }
        Returns: Json
      }
      totem_match_biometria: {
        Args: { _clinica_id: string; _descriptor: Json; _threshold?: number }
        Returns: {
          distancia: number
          nome: string
          paciente_id: string
        }[]
      }
      totem_upsert_paciente: {
        Args: {
          _clinica_id: string
          _cpf?: string
          _descriptor?: Json
          _nome: string
          _telefone?: string
        }
        Returns: string
      }
      trocar_convenio_contrato: {
        Args: {
          _contrato_id: string
          _convenio_novo_id: string
          _data_inicio?: string
          _dependentes?: Json
          _observacao?: string
          _valor_mensal?: number
        }
        Returns: Json
      }
      unaccent: { Args: { "": string }; Returns: string }
      user_is_any_manager: { Args: { _user_id: string }; Returns: boolean }
      verificar_certificado: { Args: { _codigo: string }; Returns: Json }
    }
    Enums: {
      agendamento_prioridade: "normal" | "prioritario" | "urgente"
      agendamento_status:
        | "agendado"
        | "confirmado"
        | "realizado"
        | "cancelado"
        | "faltou"
      alerta_enf_status: "aberto" | "em_contato" | "resolvido" | "sem_contato"
      app_role:
        | "admin"
        | "gestor"
        | "medico"
        | "enfermeiro"
        | "recepcao"
        | "financeiro"
        | "caixa"
        | "supervisor"
      app_role_global:
        | "admin"
        | "tesouraria"
        | "medico"
        | "enfermagem"
        | "recepcao"
        | "marketing"
        | "rh"
      caixa_mov_tipo:
        | "abertura"
        | "sangria"
        | "suprimento"
        | "recebimento"
        | "despesa"
        | "fechamento"
        | "estorno"
        | "reabertura"
      caixa_sessao_status: "aberto" | "fechado"
      chat_canal_tipo: "direto" | "grupo" | "setor"
      crm_status: "aberta" | "ganha" | "perdida"
      estoque_movimento_tipo: "entrada" | "saida" | "ajuste"
      fin_status_lancamento: "pendente" | "confirmado" | "cancelado"
      fin_tipo_conta: "caixa" | "banco" | "cartao" | "maquininha" | "outro"
      fin_tipo_lancamento: "receita" | "despesa"
      fluxo_etapa:
        | "aguardando_recepcao"
        | "recepcao"
        | "caixa"
        | "triagem"
        | "atendimento"
        | "exame"
        | "finalizado"
      forma_pagamento:
        | "dinheiro"
        | "pix"
        | "cartao_credito"
        | "cartao_debito"
        | "convenio"
        | "cartao_proprio"
        | "boleto"
        | "transferencia"
      lms_licao_tipo: "video" | "texto" | "quiz"
      modulo_acesso: "none" | "read" | "write"
      odonto_imagem_categoria:
        | "intraoral"
        | "extraoral"
        | "radiografia_periapical"
        | "radiografia_panoramica"
        | "tomografia"
        | "foto_documentacao"
        | "outro"
      odonto_status:
        | "higido"
        | "cariado"
        | "restaurado"
        | "ausente"
        | "extracao_indicada"
        | "tratamento_canal"
        | "coroa"
        | "implante"
        | "protese"
        | "fratura"
        | "selante"
        | "sangramento"
        | "mobilidade"
        | "tartaro"
        | "aparelho"
        | "faceta"
      pagamento_forma:
        | "paytime_credito"
        | "paytime_debito"
        | "paytime_pix"
        | "dinheiro"
        | "pix"
        | "cartao_credito"
        | "cartao_debito"
        | "boleto"
        | "outro"
      pagamento_status:
        | "pendente"
        | "autorizado"
        | "capturado"
        | "falhou"
        | "estornado"
        | "cancelado"
      prestador_tipo:
        | "laboratorio"
        | "clinica_imagem"
        | "locador_equipamento"
        | "parceiro_pj"
        | "outro"
      resultado_status: "pendente" | "normal" | "alterado" | "critico"
      split_beneficiario_tipo: "clinica" | "medico" | "prestador" | "outro"
      status_senha: "emitida" | "chamada" | "atendida" | "cancelada"
      tipo_documento:
        | "atestado"
        | "receita"
        | "laudo"
        | "declaracao"
        | "contrato"
        | "outro"
      tipo_senha: "N" | "P" | "C" | "R" | "T"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agendamento_prioridade: ["normal", "prioritario", "urgente"],
      agendamento_status: [
        "agendado",
        "confirmado",
        "realizado",
        "cancelado",
        "faltou",
      ],
      alerta_enf_status: ["aberto", "em_contato", "resolvido", "sem_contato"],
      app_role: [
        "admin",
        "gestor",
        "medico",
        "enfermeiro",
        "recepcao",
        "financeiro",
        "caixa",
        "supervisor",
      ],
      app_role_global: [
        "admin",
        "tesouraria",
        "medico",
        "enfermagem",
        "recepcao",
        "marketing",
        "rh",
      ],
      caixa_mov_tipo: [
        "abertura",
        "sangria",
        "suprimento",
        "recebimento",
        "despesa",
        "fechamento",
        "estorno",
        "reabertura",
      ],
      caixa_sessao_status: ["aberto", "fechado"],
      chat_canal_tipo: ["direto", "grupo", "setor"],
      crm_status: ["aberta", "ganha", "perdida"],
      estoque_movimento_tipo: ["entrada", "saida", "ajuste"],
      fin_status_lancamento: ["pendente", "confirmado", "cancelado"],
      fin_tipo_conta: ["caixa", "banco", "cartao", "maquininha", "outro"],
      fin_tipo_lancamento: ["receita", "despesa"],
      fluxo_etapa: [
        "aguardando_recepcao",
        "recepcao",
        "caixa",
        "triagem",
        "atendimento",
        "exame",
        "finalizado",
      ],
      forma_pagamento: [
        "dinheiro",
        "pix",
        "cartao_credito",
        "cartao_debito",
        "convenio",
        "cartao_proprio",
        "boleto",
        "transferencia",
      ],
      lms_licao_tipo: ["video", "texto", "quiz"],
      modulo_acesso: ["none", "read", "write"],
      odonto_imagem_categoria: [
        "intraoral",
        "extraoral",
        "radiografia_periapical",
        "radiografia_panoramica",
        "tomografia",
        "foto_documentacao",
        "outro",
      ],
      odonto_status: [
        "higido",
        "cariado",
        "restaurado",
        "ausente",
        "extracao_indicada",
        "tratamento_canal",
        "coroa",
        "implante",
        "protese",
        "fratura",
        "selante",
        "sangramento",
        "mobilidade",
        "tartaro",
        "aparelho",
        "faceta",
      ],
      pagamento_forma: [
        "paytime_credito",
        "paytime_debito",
        "paytime_pix",
        "dinheiro",
        "pix",
        "cartao_credito",
        "cartao_debito",
        "boleto",
        "outro",
      ],
      pagamento_status: [
        "pendente",
        "autorizado",
        "capturado",
        "falhou",
        "estornado",
        "cancelado",
      ],
      prestador_tipo: [
        "laboratorio",
        "clinica_imagem",
        "locador_equipamento",
        "parceiro_pj",
        "outro",
      ],
      resultado_status: ["pendente", "normal", "alterado", "critico"],
      split_beneficiario_tipo: ["clinica", "medico", "prestador", "outro"],
      status_senha: ["emitida", "chamada", "atendida", "cancelada"],
      tipo_documento: [
        "atestado",
        "receita",
        "laudo",
        "declaracao",
        "contrato",
        "outro",
      ],
      tipo_senha: ["N", "P", "C", "R", "T"],
    },
  },
} as const

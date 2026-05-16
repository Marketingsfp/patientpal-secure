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
          cep: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome?: string
          telefone?: string | null
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
      medicos: {
        Row: {
          ativo: boolean
          clinica_id: string
          created_at: string
          crm: string
          crm_uf: string
          email: string | null
          especialidade_id: string | null
          id: string
          nome: string
          percentual_repasse_padrao: number
          telefone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          created_at?: string
          crm: string
          crm_uf: string
          email?: string | null
          especialidade_id?: string | null
          id?: string
          nome: string
          percentual_repasse_padrao?: number
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          created_at?: string
          crm?: string
          crm_uf?: string
          email?: string | null
          especialidade_id?: string | null
          id?: string
          nome?: string
          percentual_repasse_padrao?: number
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
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
          clinica_id: string
          consentimento_lgpd_em: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          clinica_id: string
          consentimento_lgpd_em?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string
          consentimento_lgpd_em?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          id?: string
          nome?: string
          telefone?: string | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_clinica: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
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
      has_role: {
        Args: {
          _clinica_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_member: {
        Args: { _clinica_id: string; _user_id: string }
        Returns: boolean
      }
      user_is_any_manager: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "gestor"
        | "medico"
        | "enfermeiro"
        | "recepcao"
        | "financeiro"
      forma_pagamento:
        | "dinheiro"
        | "pix"
        | "cartao_credito"
        | "cartao_debito"
        | "convenio"
        | "cartao_proprio"
        | "boleto"
        | "transferencia"
      status_senha: "emitida" | "chamada" | "atendida" | "cancelada"
      tipo_senha: "N" | "P" | "E" | "R"
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
      app_role: [
        "admin",
        "gestor",
        "medico",
        "enfermeiro",
        "recepcao",
        "financeiro",
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
      status_senha: ["emitida", "chamada", "atendida", "cancelada"],
      tipo_senha: ["N", "P", "E", "R"],
    },
  },
} as const

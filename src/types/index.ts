export interface SGAVeiculo {
  codigo_veiculo: string | number;
  placa: string;
  chassi: string;
  renavam?: string;
  modelo: string;
  marca: string;
  ano_fabricacao?: string | number;
  ano_modelo?: string | number;
  codigo_tipo?: string | number;
  codigo_tipo_veiculo?: string | number;
  codigo_classificacao?: string | number;
  tipo?: string;
  tipo_veiculo?: string;
  categoria?: string; // "PASSEIO", "CARGA", etc.
  valor_fipe?: string | number;
  valor_fipe_protegido?: string | number;
  codigo_fipe?: string;
  codigo_situacao?: string | number;
  situacao?: string;
  data_contrato?: string;
  data_contrato_final?: string;
  data_cadastro?: string;
  codigo_associado?: string | number;
  nome_associado?: string;
  cpf_associado?: string;
  codigo_voluntario?: string | number;
  nome_voluntario?: string;
}

export interface SGASituacaoVeiculo {
  codigo_situacao: number;
  descricao_situacao: string;
  situacao: string;
  cor_fonte?: string;
  cor_linha?: string;
}

export interface SGATipoVeiculo {
  codigo_tipo: number;
  descricao_tipo: string;
  cota_fipe_cilindrada?: string;
  situacao?: string;
}

export interface SGAClassificacaoVeiculo {
  codigo: string | number;
  descricao: string;
  situacao?: string;
}

export interface RDVStatusVeiculo {
  error: string;
  message?: string;
  ativo?: boolean;
  status?: string;
  placa?: string;
  chassi?: string;
}

export interface RegraFipe {
  id: string;
  tipos: Array<{ codigo: number; nome: string }>;
  classificacoes: Array<{ codigo: number; nome: string }>; // vazio = todas
  valor_fipe_minimo: number;
  valor_fipe_maximo: number | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface VeiculoInativoRDV {
  placa: string;
  chassi: string;
  modelo: string;
  marca: string;
  tipo_veiculo: string;
  situacao_sga: string;
  data_contrato: string | null;
  dias_inativo: number | null;
  codigo_associado: number | null;
  nome_associado: string | null;
  cpf_associado: string | null;
  status_rdv: string;
}

export interface VeiculoAusenteRDV {
  placa: string;
  chassi: string;
  modelo: string;
  marca: string;
  tipo_veiculo: string;
  classificacao: string;
  valor_fipe: number;
  meses_ativo: number | null;
  codigo_associado: number | null;
  nome_associado: string | null;
  cpf_associado: string | null;
}

export type StatusRelatorio = 'concluido' | 'em_progresso' | 'erro';

export interface RelatorioInativos {
  total: number;
  veiculos: VeiculoInativoRDV[];
  gerado_em: string;
  status?: StatusRelatorio;
  verificados?: number;
  total_alvo?: number;
  erro?: string;
  aviso?: string;
}

export interface RelatorioAusentes {
  total: number;
  veiculos: VeiculoAusenteRDV[];
  gerado_em: string;
  status?: StatusRelatorio;
  verificados?: number;
  total_alvo?: number;
  erro?: string;
  aviso?: string;
}

export interface VeiculoSemPontuar {
  placa: string;
  chassi: string;
  modelo: string;
  marca: string;
  tipo_veiculo: string;
  situacao_sga: string;
  ultima_pontuacao: string | null;
  dias_sem_pontuar: number | null;
  codigo_associado: number | null;
  nome_associado: string | null;
  cpf_associado: string | null;
}

export interface RelatorioSemPontuar {
  total: number;
  veiculos: VeiculoSemPontuar[];
  gerado_em: string;
  dias_filtro: number;
  situacoes_filtro: number[];
  status?: StatusRelatorio;
  verificados?: number;
  total_alvo?: number;
  erro?: string;
}

export interface SituacaoComConfig extends SGASituacaoVeiculo {
  marcada_inativa: boolean;
}

export interface CacheRelatorio<T> {
  dados: T;
  gerado_em: string;
}

export interface SituacoesConfig {
  codigos_inativos: number[];
  atualizado_em: string;
}

// --- Mensageria (WhatsApp + E-mail) ---

export interface SGAVeiculoCompleto extends SGAVeiculo {
  nome?: string;
  cpf?: string;
  rg?: string;
  ddd?: string;
  telefone?: string;
  ddd_celular?: string;
  telefone_celular?: string;
  ddd_celular_aux?: string;
  telefone_celular_aux?: string;
  ddd_comercial?: string;
  telefone_comercial?: string;
  email?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  descricao_situacao?: string;
}

export interface ContatoAssociado {
  placa: string;
  chassi: string;
  nome: string | null;
  cpf: string | null;
  email: string | null;
  telefone_e164: string | null; // 5531999998888
  telefone_exibicao: string | null; // (31) 99999-8888
}

export interface ConfigWhatsApp {
  habilitado: boolean;
  phone_number_id: string;
  access_token: string;
  template_name: string;
  template_language: string;
  variaveis: string[]; // ordem dos placeholders enviados ao template Meta (ex: ["nome","placa","modelo","dias_sem_pontuar"])
}

export interface ConfigEmail {
  habilitado: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean; // true=SSL/465, false=STARTTLS/587
  smtp_user: string;
  smtp_pass: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  assunto: string;
  corpo_html: string;
}

export interface ConfigMensagens {
  whatsapp: ConfigWhatsApp;
  email: ConfigEmail;
  atualizado_em: string;
}

export interface ResultadoEnvioCanal {
  sucesso: boolean;
  erro?: string;
  detalhe?: string;
}

export interface ResultadoEnvio {
  placa: string;
  contato: { telefone: string | null; email: string | null; nome: string | null };
  whatsapp?: ResultadoEnvioCanal;
  email?: ResultadoEnvioCanal;
}

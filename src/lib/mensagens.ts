import { ContatoAssociado, SGAVeiculoCompleto, ConfigWhatsApp, ConfigEmail, ResultadoEnvioCanal } from '@/types';

// --- Placeholders ---

export function aplicarPlaceholders(
  template: string,
  dados: Record<string, string | number | null | undefined>
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = dados[k];
    return v === undefined || v === null ? '' : String(v);
  });
}

// --- Telefone ---

// Recebe DDD (com ou sem 0) e número, devolve E.164 (5531999998888) e exibição "(31) 99999-8888".
// Brasil only — adiciona DDI 55 sempre.
export function formatarTelefone(ddd?: string | null, numero?: string | null): { e164: string | null; exibicao: string | null } {
  if (!ddd || !numero) return { e164: null, exibicao: null };
  const dddLimpo = ddd.replace(/\D/g, '').replace(/^0+/, '');
  const numLimpo = numero.replace(/\D/g, '');
  if (dddLimpo.length < 2 || numLimpo.length < 8) return { e164: null, exibicao: null };
  const e164 = `55${dddLimpo}${numLimpo}`;
  const meio = numLimpo.length === 9 ? `${numLimpo.slice(0, 5)}-${numLimpo.slice(5)}` : `${numLimpo.slice(0, 4)}-${numLimpo.slice(4)}`;
  return { e164, exibicao: `(${dddLimpo}) ${meio}` };
}

export function extrairContato(v: SGAVeiculoCompleto): ContatoAssociado {
  // Prioridade: celular > celular_aux > comercial > telefone
  const candidatos: Array<[string | undefined, string | undefined]> = [
    [v.ddd_celular, v.telefone_celular],
    [v.ddd_celular_aux, v.telefone_celular_aux],
    [v.ddd_comercial, v.telefone_comercial],
    [v.ddd, v.telefone],
  ];
  let e164: string | null = null;
  let exibicao: string | null = null;
  for (const [ddd, num] of candidatos) {
    const f = formatarTelefone(ddd, num);
    if (f.e164) { e164 = f.e164; exibicao = f.exibicao; break; }
  }

  return {
    placa: v.placa || '',
    chassi: v.chassi || '',
    nome: v.nome || v.nome_associado || null,
    cpf: v.cpf || v.cpf_associado || null,
    email: v.email && v.email.includes('@') ? v.email : null,
    telefone_e164: e164,
    telefone_exibicao: exibicao,
  };
}

// --- WhatsApp via Meta Cloud API ---

export async function enviarWhatsAppMeta(
  config: ConfigWhatsApp,
  telefoneE164: string,
  placeholders: Record<string, string | number | null | undefined>
): Promise<ResultadoEnvioCanal> {
  if (!config.habilitado) return { sucesso: false, erro: 'WhatsApp desabilitado nas configurações' };
  if (!config.phone_number_id || !config.access_token || !config.template_name) {
    return { sucesso: false, erro: 'WhatsApp incompleto: phone_number_id, access_token e template_name são obrigatórios' };
  }

  const parameters = (config.variaveis || []).map(nome => ({
    type: 'text',
    text: String(placeholders[nome] ?? ''),
  }));

  const body = {
    messaging_product: 'whatsapp',
    to: telefoneE164,
    type: 'template',
    template: {
      name: config.template_name,
      language: { code: config.template_language || 'pt_BR' },
      components: parameters.length > 0 ? [{ type: 'body', parameters }] : [],
    },
  };

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || data?.error?.error_user_msg || `HTTP ${res.status}`;
      return { sucesso: false, erro: msg, detalhe: JSON.stringify(data?.error ?? data) };
    }
    const msgId = data?.messages?.[0]?.id;
    return { sucesso: true, detalhe: msgId };
  } catch (e) {
    return { sucesso: false, erro: String(e) };
  }
}

// --- E-mail via SMTP ---

export async function enviarEmailSMTP(
  config: ConfigEmail,
  destinatario: string,
  placeholders: Record<string, string | number | null | undefined>
): Promise<ResultadoEnvioCanal> {
  if (!config.habilitado) return { sucesso: false, erro: 'E-mail desabilitado nas configurações' };
  if (!config.smtp_host || !config.smtp_user || !config.smtp_pass || !config.from_email) {
    return { sucesso: false, erro: 'SMTP incompleto: host, user, pass e from_email são obrigatórios' };
  }

  // Import dinâmico para evitar carregar nodemailer no bundle quando não usado
  const nodemailer = await import('nodemailer');

  const transporter = nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port,
    secure: config.smtp_secure,
    auth: { user: config.smtp_user, pass: config.smtp_pass },
  });

  const placeholdersComFrom = { ...placeholders, from_name: config.from_name };
  const assunto = aplicarPlaceholders(config.assunto, placeholdersComFrom);
  const html = aplicarPlaceholders(config.corpo_html, placeholdersComFrom);

  try {
    const info = await transporter.sendMail({
      from: config.from_name ? `"${config.from_name}" <${config.from_email}>` : config.from_email,
      to: destinatario,
      replyTo: config.reply_to || undefined,
      subject: assunto,
      html,
    });
    return { sucesso: true, detalhe: info.messageId };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { sucesso: false, erro: msg };
  }
}

import { NextRequest } from 'next/server';
import { lerConfigMensagens } from '@/lib/storage';
import { buscarVeiculoCompleto } from '@/lib/sga';
import { enviarWhatsAppMeta, enviarEmailSMTP, extrairContato } from '@/lib/mensagens';
import { ResultadoEnvio } from '@/types';

export const maxDuration = 300;

interface VeiculoInput {
  placa: string;
  chassi?: string;
  modelo?: string;
  marca?: string;
  nome_associado?: string | null;
  dias_sem_pontuar?: number | null;
  ultima_pontuacao?: string | null;
}

interface PostBody {
  veiculos: VeiculoInput[];
  canais: Array<'whatsapp' | 'email'>;
}

const CONCURRENCIA = 5;

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = await req.json() as PostBody;
  } catch {
    return new Response(JSON.stringify({ erro: 'JSON inválido' }), { status: 400 });
  }
  if (!Array.isArray(body.veiculos) || body.veiculos.length === 0) {
    return new Response(JSON.stringify({ erro: 'veiculos obrigatório' }), { status: 400 });
  }
  if (!Array.isArray(body.canais) || body.canais.length === 0) {
    return new Response(JSON.stringify({ erro: 'canais obrigatório' }), { status: 400 });
  }

  const config = lerConfigMensagens();
  const enviarWA = body.canais.includes('whatsapp');
  const enviarEM = body.canais.includes('email');

  if (enviarWA && !config.whatsapp.habilitado) {
    return new Response(JSON.stringify({ erro: 'WhatsApp não está habilitado nas configurações' }), { status: 400 });
  }
  if (enviarEM && !config.email.habilitado) {
    return new Response(JSON.stringify({ erro: 'E-mail não está habilitado nas configurações' }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* cliente desconectou */ }
      }

      send({ tipo: 'log', msg: `Iniciando envio para ${body.veiculos.length} veículo(s) — canais: ${body.canais.join(', ')}` });

      const resultados: ResultadoEnvio[] = [];
      let processados = 0;

      async function processarUm(v: VeiculoInput): Promise<ResultadoEnvio> {
        // 1. Buscar contato no SGA
        let contatoTel: string | null = null;
        let contatoEmail: string | null = null;
        let contatoNome: string | null = v.nome_associado ?? null;

        const buscado = v.placa
          ? await buscarVeiculoCompleto(v.placa, 'PLACA')
          : v.chassi
          ? await buscarVeiculoCompleto(v.chassi, 'CHASSI')
          : null;

        if (buscado) {
          const c = extrairContato(buscado);
          contatoTel = c.telefone_e164;
          contatoEmail = c.email;
          contatoNome = c.nome ?? contatoNome;
        }

        const placeholders = {
          nome: contatoNome ?? '',
          placa: v.placa ?? '',
          chassi: v.chassi ?? '',
          modelo: v.modelo ?? '',
          marca: v.marca ?? '',
          dias_sem_pontuar: v.dias_sem_pontuar ?? '',
          ultima_pontuacao: v.ultima_pontuacao
            ? new Date(v.ultima_pontuacao).toLocaleDateString('pt-BR')
            : '',
        };

        const r: ResultadoEnvio = {
          placa: v.placa,
          contato: { telefone: contatoTel, email: contatoEmail, nome: contatoNome },
        };

        if (enviarWA) {
          r.whatsapp = contatoTel
            ? await enviarWhatsAppMeta(config.whatsapp, contatoTel, placeholders)
            : { sucesso: false, erro: 'Sem telefone celular cadastrado no SGA' };
        }
        if (enviarEM) {
          r.email = contatoEmail
            ? await enviarEmailSMTP(config.email, contatoEmail, placeholders)
            : { sucesso: false, erro: 'Sem e-mail cadastrado no SGA' };
        }
        return r;
      }

      // Processa em janelas de CONCURRENCIA
      for (let i = 0; i < body.veiculos.length; i += CONCURRENCIA) {
        const lote = body.veiculos.slice(i, i + CONCURRENCIA);
        const lotResultados = await Promise.all(lote.map(processarUm));
        for (const r of lotResultados) {
          resultados.push(r);
          processados++;
          send({ tipo: 'resultado', resultado: r, processados, total: body.veiculos.length });
        }
      }

      const sucWA = resultados.filter(r => r.whatsapp?.sucesso).length;
      const sucEM = resultados.filter(r => r.email?.sucesso).length;
      send({
        tipo: 'concluido',
        total: resultados.length,
        sucesso_whatsapp: enviarWA ? sucWA : null,
        sucesso_email: enviarEM ? sucEM : null,
        resultados,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

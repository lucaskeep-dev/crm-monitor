export const maxDuration = 300;

import { listarSituacoesVeiculo, listarVeiculosPorSituacao } from '@/lib/sga';
import { RdvAbortError } from '@/lib/rdv';
import { obterStatusVeiculoComCache, flushCacheRDV, statsCacheRDV } from '@/lib/cache-rdv';
import { lerSituacoesConfig, salvarCacheInativos, lerCacheInativos } from '@/lib/storage';
import { VeiculoInativoRDV } from '@/types';

function calcularInativoDesde(mesReferente: string | null | undefined, diaVencimento: string | null | undefined): { dataInativo: string | null; dias: number | null } {
  if (!mesReferente) return { dataInativo: null, dias: null };
  const partes = mesReferente.split('/');
  if (partes.length !== 2) return { dataInativo: null, dias: null };
  const [mes, ano] = partes;
  const dia = Math.min(parseInt(diaVencimento ?? '1', 10) || 1, 28);
  const ultimoPagamento = new Date(parseInt(ano), parseInt(mes) - 1, dia);
  if (isNaN(ultimoPagamento.getTime())) return { dataInativo: null, dias: null };
  const dias = Math.floor((Date.now() - ultimoPagamento.getTime()) / (1000 * 60 * 60 * 24));
  if (dias < 0) return { dataInativo: null, dias: null };
  return { dataInativo: ultimoPagamento.toISOString(), dias };
}

// Lock global por endpoint — impede que duas execuções simultâneas dividam o throttle RDV
const lockKey = '__inativos_stream_running';
function isRunning(): boolean { return Boolean((globalThis as Record<string, unknown>)[lockKey]); }
function setRunning(v: boolean) { (globalThis as Record<string, unknown>)[lockKey] = v; }

export async function GET() {
  const encoder = new TextEncoder();

  if (isRunning()) {
    const body = encoder.encode(
      `data: ${JSON.stringify({ tipo: 'log', msg: 'Outro stream de inativos já está em execução. Acompanhe o progresso pelo cache.' })}\n\n` +
      `data: ${JSON.stringify({ tipo: 'ja_em_execucao' })}\n\n`,
    );
    return new Response(new ReadableStream({ start(c) { c.enqueue(body); c.close(); } }), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }
  setRunning(true);

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const stats = statsCacheRDV();
        send({ tipo: 'log', msg: `Cache RDV: ${stats.tamanho} veículos, ${stats.status_validos} status válidos (TTL 24h)` });

        // 1. Ler configuração
        send({ tipo: 'log', msg: 'Lendo configuração de situações inativas...' });
        const config = lerSituacoesConfig();

        if (config.codigos_inativos.length === 0) {
          send({ tipo: 'erro', msg: 'Nenhuma situação marcada como inativa. Acesse Configurações para configurar.' });
          controller.close();
          return;
        }

        // 2. Buscar nomes das situações
        send({ tipo: 'log', msg: 'Buscando situações no SGA...' });
        const todasSituacoes = await listarSituacoesVeiculo();
        const situacoesInativas = todasSituacoes.filter(s =>
          config.codigos_inativos.includes(Number(s.codigo_situacao))
        );

        send({
          tipo: 'log',
          msg: `${situacoesInativas.length} situação(ões) configurada(s): ${situacoesInativas.map(s => s.descricao_situacao || s.situacao).join(', ')}`,
        });

        // 3. Buscar veículos por situação
        const todosVeiculos: Array<{ veiculo: ReturnType<typeof Object.assign>; situacaoNome: string }> = [];

        for (let i = 0; i < situacoesInativas.length; i++) {
          const sit = situacoesInativas[i];
          const nome = sit.descricao_situacao || sit.situacao;
          send({ tipo: 'log', msg: `[${i + 1}/${situacoesInativas.length}] Buscando veículos com situação "${nome}"...` });

          try {
            const veiculos = await listarVeiculosPorSituacao(sit.codigo_situacao, 1000, (carregados, total) => {
              send({ tipo: 'log', msg: `→ ${carregados} veículo(s) carregado(s)${total ? ` de ${total}` : ''}...` });
            });
            send({ tipo: 'log', msg: `✓ ${veiculos.length} veículo(s) com situação "${nome}"` });
            for (const v of veiculos) {
              todosVeiculos.push({ veiculo: v, situacaoNome: nome });
            }
          } catch (e) {
            send({ tipo: 'aviso', msg: `Situação "${nome}" ignorada: ${String(e)}` });
          }
        }

        send({ tipo: 'log', msg: `Total: ${todosVeiculos.length} veículo(s) para cruzar com a Rede Veículos` });

        if (todosVeiculos.length === 0) {
          send({ tipo: 'concluido', total: 0, veiculos: [], gerado_em: new Date().toISOString() });
          controller.close();
          return;
        }

        // 4. Cruzar com RDV em batches — preserva cache existente, apenas atualiza
        const BATCH = 10;
        const SAVE_A_CADA_N_BATCHES = 10; // ~100 veículos / ~6 min a 15 req/min

        // Carrega cache anterior e indexa por chave (placa || chassi)
        const cacheAnterior = lerCacheInativos();
        const mapaResultados = new Map<string, VeiculoInativoRDV>();
        if (cacheAnterior?.veiculos) {
          for (const v of cacheAnterior.veiculos) {
            const k = (v.placa || v.chassi || '').toUpperCase().trim();
            if (k) mapaResultados.set(k, v);
          }
        }
        const cacheAnteriorTotal = mapaResultados.size;

        // Limpa entradas que não estão mais no SGA inativo (situação mudou)
        const placasNoSGA = new Set<string>();
        for (const tv of todosVeiculos) {
          const k = (tv.veiculo.placa || tv.veiculo.chassi || '').toUpperCase().trim();
          if (k) placasNoSGA.add(k);
        }
        let removidosForaSGA = 0;
        for (const k of Array.from(mapaResultados.keys())) {
          if (!placasNoSGA.has(k)) { mapaResultados.delete(k); removidosForaSGA++; }
        }
        if (cacheAnteriorTotal > 0) {
          send({ tipo: 'log', msg: `Cache anterior: ${cacheAnteriorTotal} inativos · ${removidosForaSGA} removido(s) (não estão mais no SGA inativo) · ${mapaResultados.size} mantido(s)` });
        }

        let verificados = 0;
        let batchesDesdeSave = 0;

        function persistirParcial(status: 'em_progresso' | 'erro') {
          try {
            const lista = Array.from(mapaResultados.values());
            salvarCacheInativos({
              total: lista.length,
              veiculos: lista,
              gerado_em: new Date().toISOString(),
              status,
              verificados,
              total_alvo: todosVeiculos.length,
            });
          } catch { /* noop */ }
        }

        send({ tipo: 'rdv_inicio', total: todosVeiculos.length });

        for (let i = 0; i < todosVeiculos.length; i += BATCH) {
          const batch = todosVeiculos.slice(i, i + BATCH);

          const checagens = await Promise.allSettled(
            batch.map(async ({ veiculo: v, situacaoNome }) => {
              const k = (v.placa || v.chassi || '').toUpperCase().trim();
              if (!k) return { chave: '', resultado: null };
              const cpf = v.cpf_associado || undefined;
              const statusRDV = await obterStatusVeiculoComCache(v.placa || undefined, v.chassi || undefined);
              if (!statusRDV.existe) return { chave: k, resultado: null };

              const { dataInativo, dias } = calcularInativoDesde(v.mes_referente, v.dia_vencimento);
              const item: VeiculoInativoRDV = {
                placa: v.placa || '',
                chassi: v.chassi || '',
                modelo: v.modelo || '',
                marca: v.marca || '',
                tipo_veiculo: v.tipo || v.tipo_veiculo || String(v.codigo_tipo || v.codigo_tipo_veiculo || ''),
                situacao_sga: situacaoNome,
                data_contrato: dataInativo,
                dias_inativo: dias,
                codigo_associado: v.codigo_associado ? Number(v.codigo_associado) : null,
                nome_associado: v.nome_associado || null,
                cpf_associado: v.cpf_associado || null,
                status_rdv: statusRDV.ativo ? 'Ativo na RDV' : 'Inativo na RDV',
              };
              return { chave: k, resultado: item };
            })
          );

          for (const r of checagens) {
            if (r.status === 'rejected' && r.reason instanceof RdvAbortError) {
              persistirParcial('erro');
              throw r.reason;
            }
            if (r.status === 'fulfilled' && r.value && r.value.chave) {
              const { chave, resultado } = r.value;
              if (resultado) mapaResultados.set(chave, resultado);
              else mapaResultados.delete(chave); // não está mais na RDV
            }
          }

          verificados += batch.length;
          send({
            tipo: 'rdv_progresso',
            verificados,
            total: todosVeiculos.length,
            encontrados: mapaResultados.size,
          });

          batchesDesdeSave++;
          if (batchesDesdeSave >= SAVE_A_CADA_N_BATCHES) {
            persistirParcial('em_progresso');
            batchesDesdeSave = 0;
          }
        }

        const gerado_em = new Date().toISOString();
        const resultado = Array.from(mapaResultados.values());
        salvarCacheInativos({
          total: resultado.length,
          veiculos: resultado,
          gerado_em,
          status: 'concluido',
          verificados,
          total_alvo: todosVeiculos.length,
        });
        send({ tipo: 'concluido', total: resultado.length, veiculos: resultado, gerado_em });
      } catch (err) {
        send({ tipo: 'erro', msg: String(err) });
      } finally {
        try { flushCacheRDV(); } catch { /* noop */ }
        setRunning(false);
        controller.close();
      }
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

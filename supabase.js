/* ============================================================
   supabase.js — persistência na nuvem via Supabase
   ============================================================ */

const SupabaseStorage = (() => {

  const SUPABASE_URL = 'https://dworzfcetqllydpnzsbi.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_SSDXOOiqFFL-VvMwJLSK6A_YLHhS6zP';

  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Mapeamento camelCase ↔ snake_case ─────────────────────────────────

  function toRow(f) {
    return {
      id:               f.id,
      data:             f.data             || null,
      ad_id:            f.adId             || null,
      conta:            f.conta            || null,
      nicho:            f.nicho            || null,
      produto:          f.produto          || null,
      url_anuncio:      f.urlAnuncio       || null,
      url_anuncio_full: f.urlAnuncioFull   || null,
      url_vsl:          f.urlVsl           || null,
      views:            f.views   != null  ? parseInt(f.views, 10)    : null,
      famoso:           f.famoso           || null,
      dom_anuncio:      f.domAnuncio       || null,
      dom_anuncio_full: f.domAnuncioFull   || null,
      dom_final:        f.domFinal         || null,
      dom_final_full:   f.domFinalFull     || null,
      split:            f.split === true || f.split === 'true',
      obs:              f.obs              || null,
      gasto:            f.gasto     != null ? parseFloat(f.gasto)     : null,
      conversao:        f.conversao != null ? parseFloat(f.conversao) : null,
      moeda:            f.moeda            || 'BRL',
      hora:             f.hora             || null,
      anuncios:         Array.isArray(f.anuncios) ? f.anuncios : [],
      views_historico:  Array.isArray(f.viewsHistorico) ? f.viewsHistorico : [],
      tag_lateral:      f.tagLateral || '',
    };
  }

  function fromRow(r) {
    return {
      id:             r.id,
      data:           r.data,
      adId:           r.ad_id,
      conta:          r.conta,
      nicho:          r.nicho,
      produto:        r.produto,
      urlAnuncio:     r.url_anuncio,
      urlAnuncioFull: r.url_anuncio_full,
      urlVsl:         r.url_vsl,
      views:          r.views,
      famoso:         r.famoso,
      domAnuncio:     r.dom_anuncio,
      domAnuncioFull: r.dom_anuncio_full,
      domFinal:       r.dom_final,
      domFinalFull:   r.dom_final_full,
      split:          r.split,
      obs:            r.obs,
      gasto:          r.gasto,
      conversao:      r.conversao,
      moeda:          r.moeda || 'BRL',
      hora:           r.hora,
      anuncios:       r.anuncios || [],
      viewsHistorico: r.views_historico || [],
      tagLateral:     r.tag_lateral || '',
    };
  }

  // ── Leitura ───────────────────────────────────────────────────────────

  // PostgREST limita cada resposta a um número máximo de linhas (padrão do
  // Supabase: 1000) mesmo sem LIMIT explícito no select. Sem paginação por
  // .range(), tabelas com mais de 1000 funis nunca carregam o restante — o
  // contador "Total de funis" ficava travado em ~1000 mesmo com mais
  // registros salvos. Aqui buscamos em páginas até a página vir incompleta.
  const LOAD_PAGE_SIZE = 1000;

  async function loadFunnels() {
    const all = [];
    let from = 0;

    while (true) {
      const { data, error } = await db
        .from('funis')
        .select('*')
        .order('data',       { ascending: false })
        .order('created_at', { ascending: false })
        .order('id',         { ascending: true })
        .range(from, from + LOAD_PAGE_SIZE - 1);

      if (error) { console.error('Supabase load error:', error); return null; }
      if (!data || !data.length) break;

      all.push(...data);
      if (data.length < LOAD_PAGE_SIZE) break;
      from += LOAD_PAGE_SIZE;
    }

    return all.map(fromRow);
  }

  // ── Sincronização ─────────────────────────────────────────────────────
  // newFunnels: array atual completo
  // deletedIds: IDs que existiam antes e foram removidos

  async function syncFunnels(newFunnels, deletedIds = []) {
    const ops = [];

    // Proteção defensiva: nunca enviar dois itens com o mesmo id no mesmo
    // comando de upsert (o Postgres rejeita o batch inteiro nesse caso:
    // "ON CONFLICT DO UPDATE command cannot affect row a second time").
    const porId = new Map();
    newFunnels.forEach(f => porId.set(f.id, f));
    const deduplicados = Array.from(porId.values());

    if (deduplicados.length !== newFunnels.length) {
      console.warn(
        `syncFunnels: ${newFunnels.length - deduplicados.length} id(s) duplicado(s) removido(s) antes do upsert.`,
        newFunnels.length, '→', deduplicados.length
      );
    }

    if (deduplicados.length) {
      ops.push(
        db.from('funis').upsert(deduplicados.map(toRow), { onConflict: 'id' })
      );
    }

    for (const id of deletedIds) {
      ops.push(db.from('funis').delete().eq('id', id));
    }

    const results = await Promise.all(ops);
    const errs    = results.map(r => r.error).filter(Boolean);
    errs.forEach(e => console.error('Supabase sync error:', e));
    return errs.length === 0;
  }

  // ── Migração do localStorage ──────────────────────────────────────────

  const LOCAL_KEY = 'funil-tracker-v1';

  async function migrarLocalStorage() {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return 0;

    let local;
    try { local = JSON.parse(raw); } catch { return 0; }
    if (!Array.isArray(local) || !local.length) return 0;

    // Garantir que todos os IDs locais sejam UUIDs válidos
    local.forEach(f => {
      if (!f.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(f.id)) {
        f.id = Storage.genId();
      }
    });

    const { error } = await db
      .from('funis')
      .upsert(local.map(toRow), { onConflict: 'id' });

    if (error) { console.error('Migration error:', error); return -1; }

    localStorage.removeItem(LOCAL_KEY);
    return local.length;
  }

  // ── Contas monitoradas ────────────────────────────────────────────────

  async function loadMonitoradas() {
    const { data, error } = await db.from('contas_monitoradas').select('conta').order('created_at');
    if (error) { console.error('Error loading monitoradas:', error); return []; }
    return (data || []).map(r => r.conta);
  }

  async function saveMonitorada(conta) {
    const { error } = await db
      .from('contas_monitoradas')
      .upsert({ conta }, { onConflict: 'conta' });
    if (error) console.error('Error saving monitorada:', error);
  }

  async function deleteMonitorada(conta) {
    const { error } = await db.from('contas_monitoradas').delete().eq('conta', conta);
    if (error) console.error('Error deleting monitorada:', error);
  }

  // ── Domínios biblioteca ───────────────────────────────────────────────

  async function loadDominiosBiblioteca() {
    const { data, error } = await db.from('dominios_biblioteca').select('dominio,ads_ativos,historico');
    if (error) { console.error('Error loading dominios_biblioteca:', error); return {}; }
    const map = {};
    (data || []).forEach(r => { map[r.dominio] = { adsAtivos: r.ads_ativos || 0, historico: r.historico || [] }; });
    return map;
  }

  async function salvarAdsAtivos(dominio, novoValor) {
    const { data } = await db.from('dominios_biblioteca').select('ads_ativos,historico').eq('dominio', dominio).single();
    const valorAnterior = data?.ads_ativos ?? 0;
    if (valorAnterior === novoValor) return;
    const historico = data?.historico || [];
    historico.push({
      data: new Date().toISOString().slice(0, 10),
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      anterior: valorAnterior,
      novo: novoValor,
    });
    const { error } = await db.from('dominios_biblioteca').upsert(
      { dominio, ads_ativos: novoValor, historico, updated_at: new Date().toISOString() },
      { onConflict: 'dominio' }
    );
    if (error) console.error('Error saving ads_ativos:', error);
  }

  async function getHistoricoDominio(dominio) {
    const { data, error } = await db.from('dominios_biblioteca').select('historico,ads_ativos').eq('dominio', dominio).single();
    if (error) return { historico: [], adsAtivos: 0 };
    return { historico: data?.historico || [], adsAtivos: data?.ads_ativos || 0 };
  }

  return { loadFunnels, syncFunnels, migrarLocalStorage, loadMonitoradas, saveMonitorada, deleteMonitorada, loadDominiosBiblioteca, salvarAdsAtivos, getHistoricoDominio };
})();

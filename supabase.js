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
      mecanismo:        f.mecanismo        || null,
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
      print_trafego:    f.printTrafego || null,
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
      mecanismo:      r.mecanismo || null,
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
      printTrafego:   r.print_trafego || null,
    };
  }

  // ── Leitura ───────────────────────────────────────────────────────────

  async function loadFunnels() {
    const { data, error } = await db
      .from('funis')
      .select('*')
      .order('data',       { ascending: false })
      .order('created_at', { ascending: false });

    if (error) { console.error('Supabase load error:', error); return null; }
    return (data || []).map(fromRow);
  }

  // ── Upsert resiliente a colunas ainda não criadas no banco ────────────
  // Se a tabela 'funis' no Supabase ainda não tiver uma coluna recém
  // adicionada ao código (ex.: mecanismo, print_trafego), o PostgREST
  // rejeita o upsert inteiro com "Could not find the 'x' column of 'funis'
  // in the schema cache" — e NENHUM funil é salvo. Em vez de falhar tudo,
  // detectamos esse erro, removemos a coluna ausente e tentamos de novo,
  // para que o funil seja salvo (só aquele campo específico fica sem
  // persistir até a coluna ser criada — ver migrations/001_add_mecanismo_print_trafego.sql).
  function extractMissingColumn(error) {
    const msg = error?.message || '';
    const match = /Could not find the '([^']+)' column of '[^']+' in the schema cache/.exec(msg);
    return match ? match[1] : null;
  }

  async function upsertFunisResiliente(rows) {
    let attempt = rows;
    for (let i = 0; i < 10; i++) {
      const { error } = await db.from('funis').upsert(attempt, { onConflict: 'id' });
      if (!error) return null;

      const col = extractMissingColumn(error);
      if (!col || !(col in attempt[0])) return error;

      console.warn(
        `[Supabase] Coluna '${col}' não existe na tabela 'funis' — salvando sem ela. ` +
        `Rode migrations/001_add_mecanismo_print_trafego.sql no Supabase para habilitá-la.`
      );
      attempt = attempt.map(row => {
        const copy = { ...row };
        delete copy[col];
        return copy;
      });
    }
    return new Error('Falha ao sincronizar: excesso de colunas desconhecidas.');
  }

  // ── Sincronização ─────────────────────────────────────────────────────
  // newFunnels: array atual completo
  // deletedIds: IDs que existiam antes e foram removidos

  async function syncFunnels(newFunnels, deletedIds = []) {
    const ops = [];

    if (newFunnels.length) {
      ops.push(upsertFunisResiliente(newFunnels.map(toRow)).then(error => ({ error })));
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

    const error = await upsertFunisResiliente(local.map(toRow));

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

  // ── Upload de imagem (prints SimilarWeb/SEMrush) ──────────────────────

  const BUCKET = 'prints-trafego';

  async function uploadPrintTrafego(file, funilId) {
    const ext  = file.name.split('.').pop().toLowerCase() || 'jpg';
    const path = `${funilId}.${ext}`;

    // Tenta criar o bucket caso não exista (erro 409 = já existe, ignorar)
    await db.storage.createBucket(BUCKET, { public: true }).catch(() => {});

    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) { console.error('Upload error:', upErr); return null; }

    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function deletePrintTrafego(funilId) {
    // Tenta remover qualquer extensão comum
    const exts = ['png','jpg','jpeg','webp'];
    await Promise.all(exts.map(ext =>
      db.storage.from(BUCKET).remove([`${funilId}.${ext}`])
    ));
  }

  return { loadFunnels, syncFunnels, migrarLocalStorage, loadMonitoradas, saveMonitorada, deleteMonitorada, loadDominiosBiblioteca, salvarAdsAtivos, getHistoricoDominio, uploadPrintTrafego, deletePrintTrafego };
})();

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
      anuncios:         Array.isArray(f.anuncios) ? f.anuncios : [],
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
      anuncios:       r.anuncios || [],
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

  // ── Sincronização ─────────────────────────────────────────────────────
  // newFunnels: array atual completo
  // deletedIds: IDs que existiam antes e foram removidos

  async function syncFunnels(newFunnels, deletedIds = []) {
    const ops = [];

    if (newFunnels.length) {
      ops.push(
        db.from('funis').upsert(newFunnels.map(toRow), { onConflict: 'id' })
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

  return { loadFunnels, syncFunnels, migrarLocalStorage, loadMonitoradas, saveMonitorada, deleteMonitorada };
})();

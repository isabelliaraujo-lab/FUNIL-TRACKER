/* ============================================================
   main.js — inicialização e conexão entre módulos
   ============================================================ */

const GlobalFilters = {
  get de()    { return document.getElementById('gf-de')?.value    || null },
  get ate()   { return document.getElementById('gf-ate')?.value   || null },
  get nicho() { return document.getElementById('gf-nicho')?.value || '' },

  filter(items) {
    const de    = this.de;
    const ate   = this.ate;
    const nicho = this.nicho;
    if (!de && !ate && !nicho) return items;
    return items.filter(f => {
      if (de    && (f.data || '') <  de)    return false;
      if (ate   && (f.data || '') >  ate)   return false;
      if (nicho && f.nicho !== nicho)       return false;
      return true;
    });
  },
};

document.addEventListener('DOMContentLoaded', async () => {

  let funnels     = [];
  let prevFunnels = [];
  let monitoradas = [];

  function getFunnels()     { return funnels; }
  function getMonitoradas() { return monitoradas; }

  async function toggleMonitorar(conta) {
    if (monitoradas.includes(conta)) {
      monitoradas = monitoradas.filter(c => c !== conta);
      SupabaseStorage.deleteMonitorada(conta).catch(console.error);
      showToast(`"${conta}" removida do monitoramento.`);
    } else {
      monitoradas = [...monitoradas, conta];
      SupabaseStorage.saveMonitorada(conta).catch(console.error);
      showToast(`"${conta}" adicionada ao monitoramento!`);
    }
    if (!document.getElementById('tab-escalada').hidden) Escalada.refresh();
  }

  function setSyncStatus(state) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    const map = {
      loading: ['sync-status--saving', 'sincronizando...'],
      saving:  ['sync-status--saving', 'salvando na nuvem...'],
      saved:   ['sync-status--saved',  '✓ salvo na nuvem'],
      error:   ['sync-status--error',  '⚠ erro ao salvar — verifique a conexão'],
    };
    const [cls, txt] = map[state] || map.saved;
    el.className = 'sync-status ' + cls;
    el.textContent = txt;
  }

  function saveFunnels(updated) {
    const deletedIds = prevFunnels
      .map(f => f.id)
      .filter(id => !updated.find(f => f.id === id));

    prevFunnels = funnels;
    funnels     = updated;

    setSyncStatus('saving');
    SupabaseStorage.syncFunnels(updated, deletedIds)
      .then(ok => setSyncStatus(ok ? 'saved' : 'error'))
      .catch(() => setSyncStatus('error'));

    if (!document.getElementById('tab-analise').hidden)  Analise.refresh();
    if (!document.getElementById('tab-escalada').hidden) Escalada.refresh();
  }

  let _toastTimer = null;
  function showToast(msg, duration = 2500) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  setSyncStatus('loading');
  try {
    const migrados = await SupabaseStorage.migrarLocalStorage();
    if (migrados > 0) showToast(`${migrados} funil(s) migrado(s) para a nuvem!`, 4000);
  } catch (e) { console.error('Erro na migração:', e); }

  try {
    const cloud = await SupabaseStorage.loadFunnels();
    funnels = cloud !== null ? cloud : Storage.load();
  } catch { funnels = Storage.load(); }

  // Migração silenciosa: produto "S" → null
  let _migrou = false;
  funnels = funnels.map(f => {
    if (f.produto?.trim().toUpperCase() === 'S') {
      _migrou = true;
      return { ...f, produto: null };
    }
    return f;
  });
  if (_migrou) saveFunnels(funnels);

  prevFunnels = [...funnels];

  try {
    monitoradas = await SupabaseStorage.loadMonitoradas();
  } catch { monitoradas = []; }

  setSyncStatus('saved');

  // ── Navegação entre abas ──────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(panel => {
        panel.classList.remove('active');
        panel.hidden = true;
      });

      const target = document.getElementById('tab-' + tabId);
      target.classList.add('active');
      target.hidden = false;

      if (tabId === 'analise')   Analise.refresh();
      if (tabId === 'escalada')  Escalada.refresh();
      if (tabId === 'criativos') Criativos.refresh();
    });
  });

  // ── Seletor de modo ───────────────────────────────────────────────────
  function setMode(mode) {
    const isText = mode === 'text';
    document.getElementById('section-text').hidden   = !isText;
    document.getElementById('section-manual').hidden =  isText;
    document.getElementById('mode-btn-text').classList.toggle('active',   isText);
    document.getElementById('mode-btn-manual').classList.toggle('active', !isText);
  }
  document.getElementById('mode-btn-text')  .addEventListener('click', () => setMode('text'));
  document.getElementById('mode-btn-manual').addEventListener('click', () => setMode('manual'));

  // ── Colar texto → parser ──────────────────────────────────────────────
  let _parsed = null;

  document.getElementById('btn-parse').addEventListener('click', () => {
    const raw = document.getElementById('paste-area').value;
    if (!raw.trim()) { showToast('Cole um texto antes de extrair.'); return; }
    _parsed = Parser.parse(raw);
    document.getElementById('preview-data').value  = _parsed.data;
    document.getElementById('preview-moeda').value = _parsed.moeda || 'BRL';
    document.getElementById('preview-grid').innerHTML = Parser.buildPreviewHTML(_parsed);
    const section = document.getElementById('preview-section');
    section.hidden = false;
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  document.getElementById('btn-clear-paste').addEventListener('click', () => {
    document.getElementById('paste-area').value = '';
    document.getElementById('preview-section').hidden = true;
    _parsed = null;
  });

  document.getElementById('btn-cancel-preview').addEventListener('click', () => {
    document.getElementById('preview-section').hidden = true;
    _parsed = null;
  });

  document.getElementById('btn-confirm-parsed').addEventListener('click', () => {
    if (!_parsed) return;
    _parsed.data  = document.getElementById('preview-data').value  || _parsed.data;
    _parsed.moeda = document.getElementById('preview-moeda').value || 'BRL';
    _parsed.hora  = new Date().toTimeString().slice(0, 5);
    _parsed.id    = Storage.genId();
    funnels.unshift(_parsed);
    saveFunnels(funnels);
    Tabela.renderTable();
    document.getElementById('paste-area').value = '';
    document.getElementById('preview-section').hidden = true;
    _parsed = null;
    showToast('Funil salvo!');
  });

  // ── Formulário manual ─────────────────────────────────────────────────
  document.getElementById('m-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('m-hora').value = new Date().toTimeString().slice(0, 5);

  document.getElementById('manual-form').addEventListener('submit', e => {
    e.preventDefault();
    const v = id => document.getElementById(id).value.trim();
    const conta   = v('m-conta');
    const nicho   = v('m-nicho');
    const produto = v('m-produto');
    if (!conta && !v('m-urlAnuncio')) {
      showToast('Preencha pelo menos a Conta ou a URL do anúncio.');
      return;
    }
    const domAnuncio     = v('m-domAnuncio').toUpperCase();
    const domAnuncioFull = v('m-domAnuncioFull') || (domAnuncio ? 'https://' + domAnuncio.toLowerCase() : '');
    const domFinalFull   = v('m-domFinalFull');
    const splitVal       = document.getElementById('m-split').value === 'true';
    let domFinal = v('m-domFinal').toUpperCase();
    if (!domFinal && domFinalFull) {
      domFinal = domFinalFull.split('\n').map(u => u.trim()).filter(Boolean).map(u => {
        try { return new URL(u).hostname.replace(/^www\./i, '').toUpperCase(); }
        catch { return u.toUpperCase(); }
      }).join(' / ');
    }
    const viewsRaw = v('m-views');
    const urlAn    = v('m-urlAnuncio');
    const funnel = {
      id: Storage.genId(), data: v('m-data'), hora: v('m-hora') || null, conta, nicho,
      produto: produto.toUpperCase(), urlAnuncio: urlAn, urlAnuncioFull: urlAn,
      views: viewsRaw ? Parser.parseViews(viewsRaw) : null,
      famoso: v('m-famoso') || null, domAnuncio, domAnuncioFull,
      domFinal, domFinalFull, split: splitVal, obs: v('m-obs'),
      gasto: null, conversao: null, moeda: 'BRL',
    };
    funnels.unshift(funnel);
    saveFunnels(funnels);
    Tabela.renderTable();
    resetManual();
    showToast('Funil adicionado!');
  });

  document.getElementById('btn-reset-manual').addEventListener('click', resetManual);
  function resetManual() {
    document.getElementById('manual-form').reset();
    document.getElementById('m-data').value = new Date().toISOString().slice(0, 10);
    document.getElementById('m-hora').value = new Date().toTimeString().slice(0, 5);
  }

  // ── CSV Export/Import ─────────────────────────────────────────────────
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const ok = Storage.exportCSV(funnels);
    showToast(ok ? 'CSV exportado!' : 'Nenhum funil para exportar.');
  });

  document.getElementById('input-import-csv').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const { funnels: imported, errors } = Storage.importCSV(evt.target.result);
      if (!imported.length) { showToast('Nenhum funil encontrado no CSV.'); return; }
      const known = new Set(funnels.map(f => f.id));
      const fresh = imported.filter(f => !known.has(f.id));
      funnels = [...fresh, ...funnels];
      saveFunnels(funnels);
      Tabela.renderTable();
      const dupes = imported.length - fresh.length;
      const parts = [`${fresh.length} funil(s) importado(s).`];
      if (dupes)  parts.push(`${dupes} duplicado(s) ignorado(s).`);
      if (errors) parts.push(`${errors} linha(s) com erro ignorada(s).`);
      showToast(parts.join(' '), 4000);
    };
    reader.readAsText(file, 'utf-8');
    this.value = '';
  });

  function pedirDataImport(novos, duplicados) {
    return new Promise(resolve => {
      const hoje = new Date().toISOString().slice(0, 10);
      const esc  = Storage.escHtml;
      document.getElementById('import-count-novos').textContent = novos.length;
      document.getElementById('import-count-dup').textContent   = duplicados.length;
      document.getElementById('import-btn-count').textContent   = novos.length;
      document.getElementById('import-modal-date').value        = hoje;
      const btnConfirm = document.getElementById('btn-confirm-import-text');
      btnConfirm.disabled = novos.length === 0;
      const dupSection = document.getElementById('import-lista-duplicados');
      dupSection.style.display = duplicados.length ? 'block' : 'none';
      document.getElementById('import-dup-items').innerHTML = duplicados.map(f =>
        `<div style="font-size:12px;color:#555;padding:4px 0;border-bottom:1px solid #1a1a1a">
          ${esc(f.conta || '—')} — ${esc(f.produto || '—')}</div>`
      ).join('');
      document.getElementById('import-new-items').innerHTML = novos.length
        ? novos.map(f =>
            `<div style="font-size:12px;color:#ccc;padding:4px 0;border-bottom:1px solid #1a1a1a">
              ${esc(f.conta || '—')} — ${esc(f.produto || '—')}</div>`
          ).join('')
        : '<div style="font-size:12px;color:#555;padding:4px 0">Nenhum funil novo encontrado.</div>';
      const modal = document.getElementById('import-text-modal');
      modal.hidden = false;
      function onConfirm() {
        const data = document.getElementById('import-modal-date').value || hoje;
        const hora = document.getElementById('import-modal-janela').value || '09:00';
        modal.hidden = true; btnConfirm.disabled = false; cleanup(); resolve({ data, hora });
      }
      function onCancel() {
        modal.hidden = true; btnConfirm.disabled = false; cleanup(); resolve(null);
      }
      function cleanup() {
        btnConfirm.removeEventListener('click', onConfirm);
        document.getElementById('btn-cancel-import-text').removeEventListener('click', onCancel);
        modal.removeEventListener('click', onOverlay);
      }
      function onOverlay(e) { if (e.target === modal) onCancel(); }
      btnConfirm.addEventListener('click', onConfirm);
      document.getElementById('btn-cancel-import-text').addEventListener('click', onCancel);
      modal.addEventListener('click', onOverlay);
    });
  }

  function dividirEmBlocos(texto) {
    const linhas = texto.split('\n');
    const blocos = [];
    let atual = [];
    const ehInicioDeFunil = (linha) => {
      const l = linha.trim();
      if (/^https?:\/\//i.test(l)) return false;
      if (/~\d+\s*result/i.test(l)) return false;
      return /^\d{5,}\s*-\s*[^|]{3,}\|\s*[A-Z]{2}\s*\|\s*[^|]{2,}/.test(l);
    };
    for (const linha of linhas) {
      if (ehInicioDeFunil(linha) && atual.length > 0) {
        blocos.push(atual.join('\n')); atual = [];
      }
      atual.push(linha);
    }
    if (atual.length > 0) blocos.push(atual.join('\n'));
    return blocos.filter(b => ehInicioDeFunil(b.split('\n').find(l => l.trim()) || ''));
  }

  document.getElementById('input-import-text').addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    let texto = '';
    let linkMap = {};
    try {
      if (file.name.toLowerCase().endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const htmlResult  = await mammoth.convertToHtml({ arrayBuffer });
        const doc = new DOMParser().parseFromString(htmlResult.value, 'text/html');
        doc.querySelectorAll('a[href]').forEach(a => {
          const href  = a.getAttribute('href');
          const label = a.textContent.trim().toUpperCase();
          if (href && label) linkMap[label] = href;
        });
        const textResult = await mammoth.extractRawText({ arrayBuffer });
        texto = textResult.value;
      } else {
        texto = await file.text();
      }
    } catch (err) { showToast('Erro ao ler arquivo: ' + err.message); return; }
    if (!texto.trim()) { showToast('Arquivo vazio ou não foi possível extrair o texto.'); return; }
    const blocos = dividirEmBlocos(texto);
    if (!blocos.length) { showToast('Nenhum funil encontrado. Verifique se o formato está correto.'); return; }
    const parsed = blocos.map(b => Parser.parse(b, linkMap)).filter(f => f.conta || f.urlAnuncio);
    if (!parsed.length) { showToast('Não foi possível extrair nenhum funil válido.'); return; }
    const novos      = parsed;
    const duplicados = [];
    const resultado = await pedirDataImport(novos, duplicados);
    if (resultado === null) return;
    novos.forEach(f => { f.id = Storage.genId(); f.data = resultado.data; f.hora = resultado.hora; });
    funnels = [...novos, ...funnels];
    saveFunnels(funnels);
    Tabela.renderTable();
    showToast(`${novos.length} funil(s) importado(s) com sucesso!`, 3500);
  });

  // ── Filtro global ─────────────────────────────────────────────────────

  function refreshActiveTab() {
    if (!document.getElementById('tab-funis').hidden)     Tabela.renderTable();
    if (!document.getElementById('tab-escalada').hidden)  Escalada.refresh();
    if (!document.getElementById('tab-analise').hidden)   Analise.refresh();
    if (!document.getElementById('tab-criativos').hidden) Criativos.refresh();
  }

  function updateGfIndicator() {
    const count = [GlobalFilters.de, GlobalFilters.ate, GlobalFilters.nicho].filter(Boolean).length;
    const label = document.getElementById('gf-label');
    if (!label) return;
    label.textContent = count > 0 ? `Filtrar: ${count}` : 'Filtrar:';
    label.classList.toggle('gf-active', count > 0);
  }

  ['gf-de', 'gf-ate', 'gf-nicho'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      updateGfIndicator();
      refreshActiveTab();
    });
  });
  document.getElementById('gf-limpar')?.addEventListener('click', () => {
    document.getElementById('gf-de').value    = '';
    document.getElementById('gf-ate').value   = '';
    document.getElementById('gf-nicho').value = '';
    updateGfIndicator();
    refreshActiveTab();
  });

  // ── Inicializar módulos ───────────────────────────────────────────────
  Escalada.init(getFunnels, getMonitoradas, toggleMonitorar);
  Tabela.init(getFunnels, saveFunnels, showToast, getMonitoradas, toggleMonitorar);
  Analise.init(getFunnels);
  Criativos.init(showToast, getFunnels);

  // Migração única: funis são fonte de verdade para views em criativos existentes
  {
    const CRIATIVOS_KEY = 'funil-tracker-criativos-v1';
    try {
      const criativos = JSON.parse(localStorage.getItem(CRIATIVOS_KEY) || '[]');
      let migrou = false;
      const criativosAtualizados = criativos.map(a => {
        if (!a.urlAnuncio) return a;
        const funil = funnels.find(f => f.urlAnuncio && f.urlAnuncio === a.urlAnuncio);
        if (funil && funil.views != null && funil.views !== a.views) {
          migrou = true;
          return { ...a, views: funil.views };
        }
        return a;
      });
      if (migrou) localStorage.setItem(CRIATIVOS_KEY, JSON.stringify(criativosAtualizados));
    } catch (e) { console.error('Erro na migração inicial de views:', e); }
  }

  Escalada.refresh();

});

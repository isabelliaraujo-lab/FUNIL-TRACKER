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

// ── Escopo global: acessível por onclick inline ───────────────────────────

let funnels     = [];
let prevFunnels = [];

const NICHO_COLORS = {
  WL:'#378ADD', DB:'#639922', MM:'#7F77DD', PT:'#BA7517',
  DA:'#1D9E75', ED:'#E24B4A', NR:'#D85A30', VL:'#D4537E',
  TN:'#888780', LG:'#888780', RJ:'#888780', RE:'#888780',
  PA:'#14B8A6', CP:'#F59E0B'
};

function abrirDetalhe(id) {
  const f = funnels.find(x => x.id === id);
  if (!f) return;

  const esc = Storage.escHtml;
  const domCounts = Storage.getDomainCounts(funnels);
  const repetido = Storage.isRepeated(f, domCounts);

  let roiHtml = '';
  if (f.gasto != null && f.conversao != null && parseFloat(f.gasto) > 0) {
    const roi = ((parseFloat(f.conversao) - parseFloat(f.gasto)) / parseFloat(f.gasto)) * 100;
    const cor = roi >= 0 ? '#00c47a' : '#ff4d4d';
    roiHtml = `<span style="color:${cor};font-weight:700">${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</span>`;
  }

  const vslCdns = f.urlVsl ? f.urlVsl.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const vslCdnPrincipal = vslCdns[0] || '';
  const vslHtml = vslCdns.length ? `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">VSL</div>
      <div id="mfd2-vsl-container" style="position:relative;width:100%;max-width:480px;background:#000;border-radius:10px;overflow:hidden;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center">
        <canvas id="mfd2-vsl-canvas" style="width:100%;height:100%;display:none"></canvas>
        <div id="mfd2-vsl-loading" style="color:#fff;font-size:12px;font-family:monospace">Carregando frame...</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;margin-top:6px">
        ${vslCdns.map((url, idx) => `
          <a href="${esc(url)}" target="_blank" style="font-family:monospace;font-size:11px;color:var(--accent2);word-break:break-all;display:block">${vslCdns.length > 1 ? `CDN ${idx + 1}: ` : ''}${esc(url)}</a>
        `).join('')}
      </div>
    </div>
  ` : '';

  document.getElementById('mfd2-conteudo').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;padding-bottom:16px;border-bottom:0.5px solid var(--border)">
      <span style="background:${NICHO_COLORS[f.nicho]||'#888'};color:#fff;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:800">${esc(f.nicho||'—')}</span>
      <div>
        <div style="font-size:16px;font-weight:700">${esc(f.conta||'—')}</div>
        <div style="font-size:12px;color:var(--text-muted)">${esc(f.data||'—')}</div>
      </div>
    </div>

    ${vslHtml}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
      <div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Produto</div>
        <div style="font-size:13px;font-weight:600">${f.produto ? esc(f.produto) : '<em style="color:var(--text-muted)">—</em>'}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Views</div>
        <div style="font-size:13px;font-weight:600">${f.views || '—'}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Dom. Anúncio</div>
        <div style="font-size:12px">${f.domAnuncioFull
          ? `<a href="${esc(f.domAnuncioFull)}" target="_blank" style="color:var(--accent2)">${esc(f.domAnuncio||f.domAnuncioFull)}</a>`
          : esc(f.domAnuncio||'—')}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">
          Dom. Final ${repetido ? '<span style="color:#D85A30;font-size:10px">● repetido</span>' : ''}
        </div>
        <div style="font-size:12px">${f.domFinalFull
          ? `<a href="${esc(f.domFinalFull.split('\n')[0])}" target="_blank" style="color:var(--accent2)">${esc(f.domFinal||'—')}</a>`
          : esc(f.domFinal||'—')}</div>
      </div>
      ${f.gasto != null ? `
      <div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Gasto</div>
        <div style="font-size:13px">${Storage.formatCurrency(f.gasto, f.moeda)}</div>
      </div>
      <div>
        <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">ROI</div>
        <div style="font-size:13px">${roiHtml || '—'}</div>
      </div>` : ''}
    </div>

    ${f.urlAnuncio ? `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Link do anúncio</div>
      <a href="${esc(f.urlAnuncio)}" target="_blank" style="font-family:monospace;font-size:11px;color:var(--accent2);word-break:break-all">${esc(f.urlAnuncio)}</a>
    </div>` : ''}

    ${f.obs ? `
    <div style="margin-bottom:14px">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Observações</div>
      <div style="font-size:13px;line-height:1.6">${esc(f.obs)}</div>
    </div>` : ''}
  `;

  const modal = document.getElementById('modal-funil-detalhe-v2');
  modal.hidden = false;

  if (vslCdnPrincipal) capturarFrameVsl(vslCdnPrincipal);

  document.getElementById('mfd2-btn-editar').onclick = () => {
    modal.hidden = true;
    Tabela.openEditModalById(id);
  };
  document.getElementById('mfd2-btn-fechar').onclick = () => { modal.hidden = true; };
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; }, { once: true });
}

function capturarFrameVsl(url) {
  if (!window.Hls) return;

  if (!Hls.isSupported()) {
    const el = document.getElementById('mfd2-vsl-loading');
    if (el) el.textContent = 'Player não suportado neste browser.';
    return;
  }

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.style.display = 'none';
  document.body.appendChild(video);

  const hls = new Hls({ enableWorker: false });
  hls.loadSource(url);
  hls.attachMedia(video);

  let captureAttempted = false;

  function capture() {
    if (captureAttempted) return;
    captureAttempted = true;
    try {
      const canvas  = document.getElementById('mfd2-vsl-canvas');
      const loading = document.getElementById('mfd2-vsl-loading');
      if (!canvas || !loading) { cleanup(); return; }
      canvas.width  = video.videoWidth  || 480;
      canvas.height = video.videoHeight || 270;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.style.display  = 'block';
      loading.style.display = 'none';
    } catch (e) {
      const el = document.getElementById('mfd2-vsl-loading');
      if (el) el.textContent = 'Frame bloqueado (CORS).';
    }
    cleanup();
  }

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    video.currentTime = 1;
    video.play().catch(() => { video.currentTime = 0; });
  });

  video.addEventListener('seeked', capture);
  video.addEventListener('loadeddata', () => { setTimeout(capture, 300); });

  const timeout = setTimeout(() => {
    const el = document.getElementById('mfd2-vsl-loading');
    if (el && el.style.display !== 'none') el.textContent = 'Tempo esgotado.';
    cleanup();
  }, 12000);

  function cleanup() {
    clearTimeout(timeout);
    try { hls.destroy(); } catch (e) {}
    try { video.remove();  } catch (e) {}
  }

  hls.on(Hls.Events.ERROR, (_, data) => {
    if (data.fatal) {
      const el = document.getElementById('mfd2-vsl-loading');
      if (el) el.textContent = 'Erro ao carregar VSL.';
      cleanup();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {

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
      saving:  ['sync-status--saving', 'salvando...'],
      saved:   ['sync-status--saved',  'salvo ✓'],
      error:   ['sync-status--error',  'erro ao salvar'],
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
    window._funnelsGlobal = updated;
    window._saveFunnelsGlobal = saveFunnels;

    setSyncStatus('saving');
    SupabaseStorage.syncFunnels(updated, deletedIds)
      .then(ok => {
        setSyncStatus(ok ? 'saved' : 'error');
        if (!ok) showToast('Erro ao salvar na nuvem — veja o console para detalhes.', 4000);
      })
      .catch(() => {
        setSyncStatus('error');
        showToast('Erro ao salvar na nuvem — veja o console para detalhes.', 4000);
      });

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

  // Migração silenciosa: nichos renomeados (BP→PA, ML→MM)
  let _migrouNicho = false;
  funnels = funnels.map(f => {
    if (f.nicho === 'BP') { _migrouNicho = true; return { ...f, nicho: 'PA' }; }
    if (f.nicho === 'ML') { _migrouNicho = true; return { ...f, nicho: 'MM' }; }
    return f;
  });
  if (_migrouNicho) saveFunnels(funnels);

  window._funnelsGlobal = funnels;
  window._saveFunnelsGlobal = saveFunnels;
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
      }).join('\n');
    }
    const viewsRaw = v('m-views');
    const urlAn    = v('m-urlAnuncio');
    const funnel = {
      id: Storage.genId(), data: v('m-data'), hora: v('m-hora') || null, conta, nicho,
      produto: produto.toUpperCase(), urlAnuncio: urlAn, urlAnuncioFull: urlAn,
      urlVsl: v('m-urlVsl') || null,
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

window.abrirDetalhe = abrirDetalhe;

function formatarDataBR(data) {
  if (!data) return '—';
  const p = data.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : data;
}

// Chamado pelo módulo Criativos ao salvar uma edição de views inline,
// para registrar a entrada no histórico do funil correspondente.
function registrarViewsHistoricoFunil(urlAnuncio, viewsAnterior, viewsNovo) {
  if (viewsNovo == null || viewsNovo === viewsAnterior) return;
  if (!window._saveFunnelsGlobal || !window._funnelsGlobal) return;
  const hoje = new Date().toISOString().slice(0, 10);
  let alterou = false;

  const updated = (window._funnelsGlobal).map(f => {
    if (f.urlAnuncio !== urlAnuncio) return f;
    const historico = Array.isArray(f.viewsHistorico) ? [...f.viewsHistorico] : [];
    if (historico.length === 0 && viewsAnterior != null) {
      historico.push({ data: f.data || hoje, views: viewsAnterior });
    }
    historico.push({ data: hoje, views: viewsNovo });
    alterou = true;
    return { ...f, viewsHistorico: historico };
  });

  if (alterou) window._saveFunnelsGlobal(updated);
}
window.registrarViewsHistoricoFunil = registrarViewsHistoricoFunil;

function abrirHistoricoViews(id) {
  const funil = funnels.find(f => f.id === id);
  if (!funil) return;

  document.getElementById('views-historico-conta').textContent = funil.conta || '—';

  const historico = funil.viewsHistorico || [];

  if (!historico.length) {
    document.getElementById('views-historico-lista').innerHTML =
      '<div style="color:#555;font-size:13px">Nenhum histórico registrado ainda.</div>';
  } else {
    const ordenado = [...historico].sort((a, b) => new Date(b.data) - new Date(a.data));

    document.getElementById('views-historico-lista').innerHTML = `
      <table>
        <colgroup>
          <col style="width:100px">
          <col style="width:90px">
          <col>
        </colgroup>
        <thead>
          <tr>
            <th>Data</th>
            <th>Views</th>
            <th>Variação</th>
          </tr>
        </thead>
        <tbody>
          ${ordenado.map((entry, i) => {
            const anterior = ordenado[i + 1];
            let variacao = '—';
            if (anterior) {
              const diff = entry.views - anterior.views;
              const pct = ((diff / anterior.views) * 100).toFixed(1);
              const cor = diff > 0 ? '#00c47a' : diff < 0 ? '#ff4d4d' : '#555';
              const sinal = diff > 0 ? '+' : '';
              variacao = `<span style="color:${cor}">${sinal}${Parser.formatViews(diff)} (${sinal}${pct}%)</span>`;
            }
            return `
              <tr>
                <td>${formatarDataBR(entry.data)}</td>
                <td style="font-weight:500">${Parser.formatViews(entry.views)}</td>
                <td>${variacao}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  document.getElementById('modal-views-historico').hidden = false;
}

function fecharHistoricoViews() {
  document.getElementById('modal-views-historico').hidden = true;
}

window.abrirHistoricoViews = abrirHistoricoViews;
window.fecharHistoricoViews = fecharHistoricoViews;

async function abrirHistoricoDominio(dominio) {
  document.getElementById('dominio-historico-nome').textContent = dominio;
  document.getElementById('dominio-historico-lista').innerHTML =
    '<div style="color:#555;font-size:13px">Carregando...</div>';
  document.getElementById('modal-dominio-historico').hidden = false;

  const { historico } = await SupabaseStorage.getHistoricoDominio(dominio);

  if (!historico.length) {
    document.getElementById('dominio-historico-lista').innerHTML =
      '<div style="color:#555;font-size:13px">Nenhuma alteração registrada ainda.</div>';
    return;
  }

  const ordenado = [...historico].sort((a, b) =>
    new Date(b.data + 'T' + b.hora) - new Date(a.data + 'T' + a.hora)
  );

  document.getElementById('dominio-historico-lista').innerHTML = `
    <table>
      <colgroup>
        <col style="width:90px">
        <col style="width:70px">
        <col style="width:80px">
        <col style="width:80px">
        <col style="width:90px">
      </colgroup>
      <thead>
        <tr>
          <th>Data</th>
          <th>Hora</th>
          <th>Novo</th>
          <th>Variação</th>
        </tr>
      </thead>
      <tbody>
        ${ordenado.map(entry => {
          const diff = entry.novo - entry.anterior;
          const cor = diff > 0 ? '#00c47a' : diff < 0 ? '#ff4d4d' : '#555';
          const sinal = diff > 0 ? '+' : '';
          return `
            <tr>
              <td>${formatarDataBR(entry.data)}</td>
              <td style="color:#555">${entry.hora}</td>
              <td style="font-weight:500">${entry.novo.toLocaleString()}</td>
              <td><span style="color:${cor}">${sinal}${diff.toLocaleString()}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

window.abrirHistoricoDominio = abrirHistoricoDominio;

async function editarTagLateral(id) {
  console.log('editarTagLateral chamado com id:', id);
  console.log('_funnelsGlobal:', window._funnelsGlobal, '_saveFunnelsGlobal:', window._saveFunnelsGlobal);
  if (!window._funnelsGlobal || !window._saveFunnelsGlobal) {
    console.error('editarTagLateral: _funnelsGlobal ou _saveFunnelsGlobal não definidos');
    return;
  }
  const funil = window._funnelsGlobal.find(f => f.id === id);
  console.log('funil encontrado:', funil);
  if (!funil) return;

  const atual = funil.tagLateral || '';
  const novo = window.prompt('Tag de lateralização (ex: VSL-01, HOOK-LEAN).\nDeixe vazio para remover:', atual);
  if (novo === null) return;

  const updated = window._funnelsGlobal.map(f =>
    f.id === id ? { ...f, tagLateral: novo.trim() } : f
  );
  window._saveFunnelsGlobal(updated);
  if (!document.getElementById('tab-criativos')?.hidden) Criativos.refresh();
}

window.editarTagLateral = editarTagLateral;

function abrirFunisDodominio(dominio) {
  const funis = GlobalFilters.filter(funnels).filter(f =>
    (f.domAnuncio || '').toUpperCase() === dominio.toUpperCase()
  );

  if (!funis.length) {
    alert('Nenhum funil cadastrado com este domínio no período filtrado.');
    return;
  }

  const esc = Storage.escHtml;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:24px;max-width:640px;width:100%;max-height:80vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <div style="font-size:14px;font-weight:700;color:#f0f0f0">${esc(dominio)}</div>
          <div style="font-size:11px;color:#555;margin-top:2px">${funis.length} funil(s) cadastrado(s)</div>
        </div>
        <button class="btn btn-secondary" onclick="this.closest('[style*=fixed]').remove()">✕</button>
      </div>
      <div>
        ${funis.map(f => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:8px">
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.conta || '—')}</div>
              <div style="font-size:11px;color:#555;margin-top:2px">
                ${esc(f.nicho || '')}${f.produto ? ' · ' + esc(f.produto) : ''}${f.data ? ' · ' + esc(f.data) : ''}${f.views ? ' · ' + Parser.formatViews(f.views) + ' views' : ''}
              </div>
            </div>
            <button class="btn btn-sm btn-secondary"
              onclick="abrirDetalhe('${f.id}');this.closest('[style*=fixed]').remove()"
              title="Ver detalhes">👁</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-secondary" style="width:100%;margin-top:16px" onclick="this.closest('[style*=fixed]').remove()">Fechar</button>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

window.abrirFunisDodominio = abrirFunisDodominio;

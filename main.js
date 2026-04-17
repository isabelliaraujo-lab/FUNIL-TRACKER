/* ============================================================
   main.js — inicialização e conexão entre módulos
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ── Estado global ─────────────────────────────────────────────────────
  let funnels = Storage.load();

  // Retorna o array atual (lido por Tabela e Analise)
  function getFunnels() { return funnels; }

  // Salva, atualiza referência local e re-executa análise se necessária
  function saveFunnels(updated) {
    funnels = updated;
    Storage.save(funnels);
    if (!document.getElementById('tab-analise').hidden) {
      Analise.refresh();
    }
  }

  // ── Toast ─────────────────────────────────────────────────────────────
  let _toastTimer = null;

  function showToast(msg, duration = 2500) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

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

      // Re-executar buscas da análise com dados atuais ao entrar na aba
      if (tabId === 'analise') Analise.refresh();
    });
  });

  // ── Seletor de modo de entrada ────────────────────────────────────────
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
  let _parsed = null;  // resultado aguardando confirmação

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
    _parsed.id    = Storage.genId();

    funnels.unshift(_parsed);
    saveFunnels(funnels);
    Tabela.renderTable();

    document.getElementById('paste-area').value   = '';
    document.getElementById('preview-section').hidden = true;
    _parsed = null;

    showToast('Funil salvo!');
  });

  // ── Formulário manual ─────────────────────────────────────────────────
  // Data padrão = hoje
  document.getElementById('m-data').value = new Date().toISOString().slice(0, 10);

  document.getElementById('manual-form').addEventListener('submit', e => {
    e.preventDefault();

    const v = id => document.getElementById(id).value.trim();

    const conta   = v('m-conta');
    const nicho   = v('m-nicho');
    const produto = v('m-produto');

    if (!conta || !nicho || !produto) {
      showToast('Preencha os campos obrigatórios: Conta, Nicho e Produto.');
      return;
    }

    const domAnuncio     = v('m-domAnuncio').toUpperCase();
    const domAnuncioFull = v('m-domAnuncioFull')
      || (domAnuncio ? 'https://' + domAnuncio.toLowerCase() : '');

    const domFinalFull = v('m-domFinalFull');
    const splitVal     = document.getElementById('m-split').value === 'true';

    // Derivar domFinal a partir das URLs finais se não preenchido
    let domFinal = v('m-domFinal').toUpperCase();
    if (!domFinal && domFinalFull) {
      domFinal = domFinalFull
        .split('\n')
        .map(u => u.trim())
        .filter(Boolean)
        .map(u => {
          try { return new URL(u).hostname.replace(/^www\./i, '').toUpperCase(); }
          catch { return u.toUpperCase(); }
        })
        .join(' / ');
    }

    const viewsRaw = v('m-views');
    const urlAn    = v('m-urlAnuncio');

    const funnel = {
      id:            Storage.genId(),
      data:          v('m-data'),
      conta,
      nicho,
      produto:       produto.toUpperCase(),
      urlAnuncio:    urlAn,
      urlAnuncioFull: urlAn,
      views:         viewsRaw ? Parser.parseViews(viewsRaw) : null,
      famoso:        v('m-famoso') || null,
      domAnuncio,
      domAnuncioFull,
      domFinal,
      domFinalFull,
      split:         splitVal,
      obs:           v('m-obs'),
      gasto:         null,
      conversao:     null,
      moeda:         'BRL',
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
  }

  // ── CSV Export ────────────────────────────────────────────────────────
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const ok = Storage.exportCSV(funnels);
    showToast(ok ? 'CSV exportado!' : 'Nenhum funil para exportar.');
  });

  // ── CSV Import ────────────────────────────────────────────────────────
  document.getElementById('input-import-csv').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      const { funnels: imported, errors } = Storage.importCSV(evt.target.result);

      if (!imported.length) {
        showToast('Nenhum funil encontrado no CSV.');
        return;
      }

      // Mesclar: adicionar apenas IDs que ainda não existem
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
    this.value = '';  // permite reimportar o mesmo arquivo
  });

  // ── Inicializar módulos ───────────────────────────────────────────────
  Tabela.init(getFunnels, saveFunnels, showToast);
  Analise.init(getFunnels);

});

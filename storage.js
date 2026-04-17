/* storage.js — salvar/carregar dados (localStorage) */
/* Implementação completa virá na próxima etapa */

const Storage = (() => {
  const KEY = 'funil-tracker-v1';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }

  function save(funnels) {
    localStorage.setItem(KEY, JSON.stringify(funnels));
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  return { load, save, genId };
})();

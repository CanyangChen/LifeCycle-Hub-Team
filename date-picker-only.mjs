// Shared picker-only dates: never set readonly, which disables native pickers in some browsers.
(() => {
  for (const input of document.querySelectorAll('input[type="date"]')) {
    const openPicker = () => {
      if (!input.disabled && typeof input.showPicker === 'function') {
        try { input.showPicker(); return true; } catch { /* Native calendar affordance remains available. */ }
      }
      return false;
    };
    input.addEventListener('click', openPicker);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { if (openPicker()) event.preventDefault(); return; }
      if (event.key === 'Backspace' || event.key === 'Delete' || (event.key.length === 1 && !event.ctrlKey && !event.metaKey)) event.preventDefault();
    });
    input.addEventListener('beforeinput', event => event.preventDefault());
    input.addEventListener('cut', event => event.preventDefault());
    input.addEventListener('paste', event => event.preventDefault());
    input.addEventListener('drop', event => event.preventDefault());
    input.setAttribute('inputmode', 'none');
    input.setAttribute('aria-description', '通过日期选择器选择；可按 Enter 或空格打开。');
  }
})();

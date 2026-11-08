/* A writing-only theme preference; the CMS appearance setting remains intact. */
(() => {
  'use strict';

  const storageKey = 'beyond-representation.writing-theme';
  const themes = new Set(['default', 'light', 'dark']);
  let choice = 'default';

  try {
    const saved = localStorage.getItem(storageKey);
    if (themes.has(saved)) choice = saved;
  } catch {
    // The selector still works for this page when storage is unavailable.
  }

  function apply(editor) {
    if (choice === 'default') delete editor.dataset.brTheme;
    else editor.dataset.brTheme = choice;
  }

  function install() {
    for (const editor of document.querySelectorAll('.content-editor')) {
      const toolbar = editor.querySelector(':scope > [role="toolbar"] > .inner');
      if (!toolbar || toolbar.querySelector('.br-writing-theme')) continue;

      const label = document.createElement('label');
      label.className = 'br-writing-theme';
      const caption = document.createElement('span');
      caption.textContent = '화면';
      const select = document.createElement('select');
      select.setAttribute('aria-label', '글쓰기 화면 테마');
      for (const [value, text] of [['default', '기본 설정'], ['light', '라이트'], ['dark', '다크']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        select.append(option);
      }
      select.value = choice;
      select.addEventListener('change', () => {
        choice = themes.has(select.value) ? select.value : 'default';
        apply(editor);
        try {
          if (choice === 'default') localStorage.removeItem(storageKey);
          else localStorage.setItem(storageKey, choice);
        } catch {
          // Keep the choice active until this page closes.
        }
      });
      label.append(caption, select);
      const save = toolbar.querySelector('.save-progress');
      if (save) toolbar.insertBefore(label, save);
      else toolbar.append(label);
      apply(editor);
    }
  }

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; install(); });
  }).observe(document.body, { childList: true, subtree: true });
  install();
})();

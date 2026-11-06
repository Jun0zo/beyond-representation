/* Extend the pinned Sveltia editor while keeping its image upload workflow. */
(() => {
  'use strict';

  const COMPONENT = 'sized-image';
  const CUSTOM_TYPE = `x-${COMPONENT}`;
  const IMAGE_TYPES = new Set(['image', 'linked-image', CUSTOM_TYPE]);
  const MIN_WIDTH = 15;
  const MAX_WIDTH = 100;
  const ATTRIBUTE_BLOCK = /^\{([^{}\n]*)\}/;
  const ATTRIBUTE_ITEMS = /^(?:\s*(?:#[\w-]+|\.[\w-]+|[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s{}]+)))+\s*$/;
  const WIDTH_ATTRIBUTE = /(^|\s)width\s*=\s*(?:"([\d.]+%)"|'([\d.]+%)'|([\d.]+%))(?=\s|$)/i;
  const ANY_WIDTH_ATTRIBUTE = /(^|\s)width\s*=\s*(?:"[^"]*"|'[^']*'|[^\s{}]+)(?=\s|$)/i;
  const ALT = String.raw`(?:[^\]\\!]|\\(?!!\[).|!(?!\[))*`;
  const SOURCE = String.raw`(?:[^"()\\!]|\\(?!!\[).|!(?!\[)|\((?:[^)!]|!(?!\[))*\)|"(?:[^"!]|!(?!\[))*")*?`;
  const TITLE = String.raw`(?:[^"\\!]|\\(?!!\[).|!(?!\[))*`;
  const LINK = String.raw`[^()]*(?:\([^)]*\)[^)]*|\([^)]*)?`;
  const image = (suffix) => String.raw`!\[(?<alt${suffix}>${ALT})\]\((?<src${suffix}>${SOURCE})(?:(?<![^\\]\s)\s+"(?<title${suffix}>${TITLE})")?\)`;
  const attributes = (suffix) => String.raw`\{(?=(?:\s*|[^{}\n]*\s)width\s*=\s*(?:"[\d.]+%"|'[\d.]+%'|[\d.]+%)(?=\s|\}))(?<attrs${suffix}>[^{}\n]*)\}`;
  const PATTERN = new RegExp(String.raw`\[${image('Linked')}${attributes('Linked')}\]\((?<link>${LINK})\)|${image('Plain')}${attributes('Plain')}`);

  const clamp = (width) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(width)));
  const escapeTitle = (value) => String(value).replace(/\\(?=[!-/:-@[-`{-~]|$)/g, '\\\\').replace(/"/g, '\\"');
  const unescapeTitle = (value) => String(value || '').replace(/\\([!-/:-@[-`{-~])/g, '$1');
  const widthFrom = (attrs) => {
    const match = String(attrs || '').match(WIDTH_ATTRIBUTE);
    const number = Number.parseFloat(match?.[2] || match?.[3] || match?.[4] || '100');
    return Number.isFinite(number) && number > 0 ? number : 100;
  };
  const withWidth = (attrs, width) => {
    const original = String(attrs || '').trim();
    const replacement = `width=${width}%`;
    return ANY_WIDTH_ATTRIBUTE.test(original)
      ? original.replace(ANY_WIDTH_ATTRIBUTE, (_, space) => `${space}${replacement}`)
      : [original, replacement].filter(Boolean).join(' ');
  };
  const escapeAttribute = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);

  function register(CMS) {
    CMS.registerEditorComponent({
      id: COMPONENT,
      label: '이미지',
      fields: [
        { name: 'src', label: '소스', widget: 'image' },
        { name: 'alt', label: '대체 텍스트', required: false },
        { name: 'title', label: '제목', required: false },
        { name: 'link', label: '링크', required: false },
        { name: 'attributes', widget: 'hidden', default: '' },
        { name: 'width', widget: 'hidden', default: '100' },
      ],
      pattern: PATTERN,
      fromBlock: ({ groups = {} }) => {
        const linked = groups.srcLinked !== undefined;
        const suffix = linked ? 'Linked' : 'Plain';
        const attrs = groups[`attrs${suffix}`] || '';
        return {
          src: (groups[`src${suffix}`] || '').trim(),
          alt: groups[`alt${suffix}`] || '',
          title: unescapeTitle(groups[`title${suffix}`]),
          link: linked ? (groups.link || '').trim() : '',
          attributes: attrs,
          width: String(widthFrom(attrs)),
        };
      },
      toBlock: ({ src = '', alt = '', title = '', link = '', attributes: attrs = '', width = '100' }) => {
        if (!src) return '';
        const numericWidth = Number.parseFloat(width);
        const safeWidth = Number.isFinite(numericWidth) && numericWidth > 0 ? numericWidth : 100;
        const img = `![${alt}](${src}${title ? ` "${escapeTitle(title)}"` : ''}){${withWidth(attrs, safeWidth)}}`;
        return link ? `[${img}](${link})` : img;
      },
      toPreview: ({ src = '', alt = '', title = '', link = '', width = '100' }) => {
        const safeWidth = Number.parseFloat(width);
        const img = `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" title="${escapeAttribute(title)}" style="width: ${Number.isFinite(safeWidth) && safeWidth > 0 ? safeWidth : 100}%">`;
        return link ? `<a href="${escapeAttribute(link)}">${img}</a>` : img;
      },
    });
    observeEditor();
  }

  function nodeInfo(component) {
    const root = component.closest('.lexical-root');
    const editor = root?.__lexicalEditor;
    if (!editor?._keyToDOMMap || !editor?._nodes || root.getAttribute('aria-readonly') === 'true') return null;
    const entry = [...editor._keyToDOMMap].find(([, element]) => element === component);
    const key = entry?.[0];
    const node = key && editor.getEditorState()._nodeMap.get(key);
    const klass = editor._nodes.get(CUSTOM_TYPE)?.klass;
    return node && klass && IMAGE_TYPES.has(node.getType()) ? { editor, key, node, klass } : null;
  }

  function visibleWidth(info) {
    const width = Number.parseFloat(info.node.__props?.width);
    return clamp(Number.isFinite(width) && width > 0 ? width : 100);
  }

  function updateNodeWidth(component, width) {
    const info = nodeInfo(component);
    if (!info) return;
    const value = String(clamp(width));
    info.editor.update(() => {
      const node = info.node.getLatest();
      const props = { ...node.__props, width: value };
      if (node.getType() === CUSTOM_TYPE) {
        node.getWritable().__props = props;
      } else {
        const next = node.getNextSibling();
        const text = next?.getType() === 'text' ? next.getTextContent() : '';
        const match = text.match(ATTRIBUTE_BLOCK);
        if (match && ATTRIBUTE_ITEMS.test(match[1])) {
          props.attributes = match[1];
          const remaining = text.slice(match[0].length);
          if (remaining) next.setTextContent(remaining);
          else next.remove();
        }
        node.replace(new info.klass(props));
      }
    }, { discrete: true });
  }

  function setAppearance(component, handle, width) {
    const value = clamp(width);
    component.style.setProperty('--br-image-width', `${value}%`);
    handle.setAttribute('aria-valuenow', value);
    handle.setAttribute('aria-valuetext', `${value}%`);
    handle.querySelector('.br-image-size-value').textContent = `${value}%`;
  }

  function addHandle(component, preview, info) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'br-image-size-handle';
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', '이미지 크기');
    handle.setAttribute('aria-description', '드래그하거나 방향키로 크기를 조절합니다.');
    handle.setAttribute('aria-valuemin', MIN_WIDTH);
    handle.setAttribute('aria-valuemax', MAX_WIDTH);
    handle.title = '드래그하거나 방향키로 크기 조절';
    handle.innerHTML = '<span aria-hidden="true">↘</span><span class="br-image-size-value" aria-hidden="true"></span>';
    preview.append(handle);
    setAppearance(component, handle, visibleWidth(info));

    let drag = null;
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const current = nodeInfo(component);
      const fullWidth = preview.parentElement?.getBoundingClientRect().width || 0;
      if (!current || !fullWidth) return;
      event.preventDefault();
      event.stopPropagation();
      drag = { pointerId: event.pointerId, startX: event.clientX, startWidth: visibleWidth(current), width: visibleWidth(current), fullWidth };
      component.dataset.brResizing = 'true';
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      drag.width = clamp(drag.startWidth + ((event.clientX - drag.startX) / drag.fullWidth) * 100);
      setAppearance(component, handle, drag.width);
    });
    const finish = (event, cancelled) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const { width, startWidth } = drag;
      drag = null;
      delete component.dataset.brResizing;
      if (!cancelled && width !== startWidth) updateNodeWidth(component, width);
      else setAppearance(component, handle, startWidth);
    };
    handle.addEventListener('pointerup', (event) => finish(event, false));
    handle.addEventListener('pointercancel', (event) => finish(event, true));
    handle.addEventListener('keydown', (event) => {
      const current = nodeInfo(component);
      if (!current) return;
      const width = visibleWidth(current);
      let next = width;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next -= event.shiftKey ? 10 : 5;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next += event.shiftKey ? 10 : 5;
      else if (event.key === 'Home') next = MIN_WIDTH;
      else if (event.key === 'End') next = MAX_WIDTH;
      else return;
      event.preventDefault();
      event.stopPropagation();
      if (clamp(next) !== width) updateNodeWidth(component, next);
    });
    handle.addEventListener('click', (event) => event.stopPropagation());
  }

  function observeEditor() {
    let scheduled = false;
    const scan = () => {
      scheduled = false;
      for (const component of document.querySelectorAll('.lexical-root [data-component-name="image"], .lexical-root [data-component-name="linked-image"], .lexical-root [data-component-name="x-sized-image"]')) {
        const preview = component.querySelector('.filled > .preview');
        const info = nodeInfo(component);
        if (!preview || !info) continue;
        const handle = preview.querySelector('.br-image-size-handle');
        if (!handle) addHandle(component, preview, info);
        else if (!component.dataset.brResizing) setAppearance(component, handle, visibleWidth(info));
      }
    };
    const schedule = () => {
      if (!scheduled) {
        scheduled = true;
        window.requestAnimationFrame(scan);
      }
    };
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    schedule();
  }

  window.BlogImageResize = { register };
})();

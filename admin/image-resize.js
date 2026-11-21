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

  function keyForElement(editor, element) {
    for (const [key, dom] of editor._keyToDOMMap) {
      if (dom === element) return key;
    }
    return null;
  }

  function nodeInfo(component) {
    const root = component.closest('.lexical-root');
    const editor = root?.__lexicalEditor;
    if (!editor?._keyToDOMMap || !editor?._nodes || root.getAttribute('aria-readonly') === 'true') return null;
    const key = keyForElement(editor, component);
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
    if (handle.getAttribute('aria-valuenow') === String(value)) return;
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

  function moveImage(component, placement) {
    const info = nodeInfo(component);
    if (!info || !placement) return;
    const { editor, node } = info;
    const targetKey = keyForElement(editor, placement.block);
    if (!targetKey) return;
    editor.update(() => {
      const target = editor.getEditorState()._nodeMap.get(targetKey)?.getLatest();
      const image = node.getLatest();
      if (target?.getParent()?.getType() !== 'root' || !image.isAttached()) return;
      const parent = image.getParent();
      const next = image.getNextSibling();
      const text = next?.getType() === 'text' ? next.getTextContent() : '';
      const attrs = text.match(ATTRIBUTE_BLOCK);
      const attrLength = attrs && ATTRIBUTE_ITEMS.test(attrs[1]) ? attrs[0].length : 0;
      const standalone = parent.getType() === 'paragraph' && parent.getParent()?.getType() === 'root'
        && (parent.getChildrenSize() === 1 || (parent.getChildrenSize() === 2 && attrLength && attrLength === text.length));
      const block = standalone ? parent : image;
      const before = placement.before;
      if (block.is(target) || (before ? target.getPreviousSibling() : target.getNextSibling())?.is(block)) return;
      const needsParagraph = !standalone && parent.getType() !== 'root';
      const destination = needsParagraph ? new (editor._nodes.get('paragraph').klass)() : block;
      if (before) target.insertBefore(destination);
      else target.insertAfter(destination);
      if (needsParagraph) {
        destination.append(image);
        if (attrLength) destination.append(attrLength === text.length ? next : next.splitText(attrLength)[0]);
      }
    }, { discrete: true, tag: 'history-push' });
  }

  function placementAt(root, x, y) {
    if (!root.contains(document.elementFromPoint(x, y))) return null;
    for (const block of root.children) {
      const rect = block.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return { block, before: true };
    }
    return root.lastElementChild ? { block: root.lastElementChild, before: false } : null;
  }

  function scrollPane(element) {
    for (let pane = element.parentElement; pane; pane = pane.parentElement) {
      if (pane.scrollHeight > pane.clientHeight && /^(auto|scroll)$/.test(getComputedStyle(pane).overflowY)) return pane;
    }
    return null;
  }

  let cancelMove;

  function startMove(event, component, handle) {
    if (event.button !== 0 || !event.isPrimary || !nodeInfo(component)) return;
    cancelMove?.();
    const root = component.closest('.lexical-root');
    const pane = scrollPane(root);
    const controller = new AbortController();
    const options = { capture: true, signal: controller.signal };
    const origin = { x: event.clientX, y: event.clientY };
    let point = origin;
    let placement = null;
    let frame = 0;
    let dragging = false;

    function mark(next) {
      if (placement?.block === next?.block && placement?.before === next?.before) return;
      if (placement) delete placement.block.dataset.brImageDrop;
      placement = next;
      if (next) next.block.dataset.brImageDrop = next.before ? 'before' : 'after';
    }

    function paint() {
      frame = 0;
      if (!component.isConnected) {
        finish(false);
        return;
      }
      mark(placementAt(root, point.x, point.y));
      if (!pane) return;
      const rect = pane.getBoundingClientRect();
      if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) return;
      const distance = Math.max(0, point.y - rect.bottom + 48) - Math.max(0, rect.top + 48 - point.y);
      if (distance) {
        const previous = pane.scrollTop;
        pane.scrollTop += Math.sign(distance) * Math.ceil(Math.abs(distance) / 3);
        if (previous !== pane.scrollTop) frame = requestAnimationFrame(paint);
      }
    }

    function finish(commit) {
      cancelMove = null;
      controller.abort();
      cancelAnimationFrame(frame);
      const drop = placement;
      mark(null);
      delete component.dataset.brMoving;
      if (!dragging) return;
      if (commit) moveImage(component, drop);
      // A drag ends with a click in some browsers. Keep the asset picker closed.
      const swallowClick = (click) => { click.preventDefault(); click.stopImmediatePropagation(); };
      document.addEventListener('click', swallowClick, true);
      setTimeout(() => document.removeEventListener('click', swallowClick, true), 0);
    }

    document.addEventListener('pointermove', (move) => {
      if (move.pointerId !== event.pointerId) return;
      point = { x: move.clientX, y: move.clientY };
      if (!dragging && Math.hypot(point.x - origin.x, point.y - origin.y) < 5) return;
      dragging = true;
      component.dataset.brMoving = 'true';
      move.preventDefault();
      if (!frame) frame = requestAnimationFrame(paint);
    }, options);
    document.addEventListener('pointerup', (up) => {
      if (up.pointerId !== event.pointerId) return;
      if (dragging) mark(placementAt(root, up.clientX, up.clientY));
      finish(true);
    }, options);
    document.addEventListener('pointercancel', (cancel) => {
      if (cancel.pointerId === event.pointerId) finish(false);
    }, options);
    window.addEventListener('blur', () => finish(false), { signal: controller.signal });
    cancelMove = () => finish(false);
    if (handle.contains(event.target)) handle.focus({ preventScroll: true });
    event.preventDefault();
    event.stopPropagation();
  }

  function addMoveHandle(component) {
    const header = component.querySelector(':scope > .header .start');
    if (!header || header.querySelector('.br-image-move')) return;
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'br-image-move';
    handle.textContent = '↕ 이동';
    handle.setAttribute('aria-label', '이미지 이동');
    handle.title = '드래그하거나 위아래 방향키로 위치 이동';
    handle.setAttribute('aria-description', handle.title);
    header.append(handle);
    handle.addEventListener('pointerdown', (event) => startMove(event, component, handle));
    handle.addEventListener('click', (event) => event.stopPropagation());
    handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      event.stopPropagation();
      const root = component.closest('.lexical-root');
      const current = [...root.children].find((block) => block.contains(component));
      const before = event.key === 'ArrowUp';
      const block = before ? current?.previousElementSibling : current?.nextElementSibling;
      if (block) {
        const info = nodeInfo(component);
        moveImage(component, { block, before });
        requestAnimationFrame(() => info?.editor.getElementByKey(info.key)?.querySelector('.br-image-move')?.focus());
      }
    });
  }

  // Each file stays attached to its own node while the CMS mounts the asset field.
  const filesByEditor = new WeakMap();

  function stageFile(component, info) {
    const pending = filesByEditor.get(info.editor);
    const file = pending?.get(info.key);
    if (!file) return;
    const field = component.querySelector('[data-field-type="image"] .drop-target');
    if (field) {
      pending.delete(info.key);
      field.dispatchEvent(new CustomEvent('Select', { detail: { files: [file] } }));
    }
  }

  function enableFileDrops() {
    const body = '[data-mode="edit"] [data-key-path="body"] .lexical-root[contenteditable="true"]';
    let marked;
    function clear() {
      if (marked) delete marked.dataset.brImageDrop;
      marked = null;
    }
    function target(event) {
      if (!Array.from(event.dataTransfer?.items || []).some((item) => item.kind === 'file' && item.type.startsWith('image/'))) return null;
      // Dropping on an asset field uses the CMS's existing replacement control.
      if (event.target.closest('[data-component-name], [data-field-type="image"]')) return null;
      return event.target.closest(body);
    }
    document.addEventListener('dragover', (event) => {
      const root = target(event);
      clear();
      if (!root) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      const place = placementAt(root, event.clientX, event.clientY);
      if (place) {
        marked = place.block;
        marked.dataset.brImageDrop = place.before ? 'before' : 'after';
      }
    }, true);
    document.addEventListener('dragleave', (event) => {
      if (marked && !marked.closest(body)?.contains(event.relatedTarget)) clear();
    }, true);
    document.addEventListener('dragend', clear, true);
    document.addEventListener('drop', (event) => {
      clear();
      const root = target(event);
      const editor = root?.__lexicalEditor;
      if (!editor) return;
      const place = placementAt(root, event.clientX, event.clientY);
      const key = place && keyForElement(editor, place.block);
      if (!key) return;
      const ImageNode = (editor._nodes.get('linked-image') || editor._nodes.get('image'))?.klass;
      const Paragraph = editor._nodes.get('paragraph')?.klass;
      const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
      if (!ImageNode || !Paragraph || !files.length) return;
      event.preventDefault();
      event.stopPropagation();
      const pending = filesByEditor.get(editor) || new Map();
      filesByEditor.set(editor, pending);
      editor.update(() => {
        const target = editor.getEditorState()._nodeMap.get(key).getLatest();
        const following = place.before ? target : target.getNextSibling();
        const parent = target.getParent();
        for (const file of files) {
          const image = new ImageNode({ src: '', alt: '' });
          const paragraph = new Paragraph().append(image);
          if (following) following.insertBefore(paragraph);
          else parent.append(paragraph);
          pending.set(image.getKey(), file);
        }
        if (target.getType() === 'paragraph' && target.isEmpty()) target.remove();
      }, { discrete: true, tag: 'history-push' });
    }, true);
  }

  function observeEditor() {
    enableFileDrops();
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && cancelMove) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelMove();
      }
    }, true);
    // Leave touch scrolling on the photo itself; the move handle also supports touch.
    document.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.target.closest('button, input, a')) return;
      const preview = event.target.closest('.lexical-root .filled > .preview');
      const component = preview?.closest('[data-component-name]');
      const handle = component?.querySelector('.br-image-move');
      if (handle) startMove(event, component, handle);
    }, true);
    let scheduled = false;
    const scan = () => {
      scheduled = false;
      for (const component of document.querySelectorAll('.lexical-root [data-component-name="image"], .lexical-root [data-component-name="linked-image"], .lexical-root [data-component-name="x-sized-image"]')) {
        const preview = component.querySelector('.filled > .preview');
        const info = nodeInfo(component);
        if (!info) continue;
        stageFile(component, info);
        addMoveHandle(component);
        if (!preview) continue;
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

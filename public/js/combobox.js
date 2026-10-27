// Searchable dropdown with sprite thumbnails and keyboard navigation.
// Options: { value, label, no, icon, terms } — `terms` is the lowercase search text.


export function normalize(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export class Combobox {
  constructor(host, { placeholder, onSelect }) {
    this.options = [];
    this.byValue = new Map();
    this.value = null;
    this.onSelect = onSelect;
    this.matches = [];
    this.active = 0;

    host.classList.add('combo');
    host.innerHTML = '<img class="combo-icon" alt=""><input type="text" autocomplete="off" spellcheck="false"><ul class="combo-list" role="listbox" hidden></ul>';
    this.icon = host.querySelector('.combo-icon');
    this.input = host.querySelector('input');
    this.list = host.querySelector('ul');
    this.input.placeholder = placeholder;
    this.input.setAttribute('role', 'combobox');

    this.input.addEventListener('focus', () => {
      this.input.select();
      this.open('');
    });
    this.input.addEventListener('input', () => this.open(this.input.value));
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.input.addEventListener('blur', () => setTimeout(() => this.close(), 120));
    this.list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li[data-index]');
      if (!li) return;
      e.preventDefault();
      this.choose(this.matches[Number(li.dataset.index)]);
    });
  }

  setOptions(options) {
    this.options = options;
    this.byValue = new Map(options.map((o) => [o.value, o]));
    this.setValue(this.value);
  }

  setValue(value) {
    this.value = value;
    if (document.activeElement === this.input) return;
    const option = this.byValue.get(value);
    this.input.value = option ? option.label : '';
    if (option) this.icon.src = option.icon;
    else this.icon.removeAttribute('src');
  }

  search(query) {
    const q = normalize(query.trim());
    if (!q) return this.options; // browsing: the whole dex, thumbnails load lazily while scrolling
    const num = /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : null;
    const starts = [];
    const contains = [];
    for (const o of this.options) {
      if (num !== null) {
        if (o.no === num) starts.push(o);
        else if (String(o.no).startsWith(String(num))) contains.push(o);
      } else if (o.terms.some((t) => t.startsWith(q))) starts.push(o);
      else if (o.terms.some((t) => t.includes(q))) contains.push(o);
    }
    return starts.concat(contains);
  }

  open(query) {
    this.matches = this.search(query);
    this.active = 0;
    this.list.innerHTML = this.matches.length
      ? this.matches
          .map(
            (o, i) =>
              `<li role="option" data-index="${i}"${i === 0 ? ' class="active"' : ''}>` +
              `<img loading="lazy" src="${o.icon}" alt=""><span class="no">#${String(o.no).padStart(3, '0')}</span>` +
              `<span>${escapeHtml(o.label)}</span></li>`,
          )
          .join('')
      : '<li class="empty">No match</li>';
    this.list.hidden = false;
  }

  close() {
    this.list.hidden = true;
    const option = this.byValue.get(this.value);
    this.input.value = option ? option.label : '';
  }

  highlight(index) {
    const items = this.list.querySelectorAll('li[data-index]');
    if (!items.length) return;
    this.active = (index + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle('active', i === this.active));
    items[this.active].scrollIntoView({ block: 'nearest' });
  }

  onKey(e) {
    if (e.key === 'ArrowDown') this.highlight(this.active + 1);
    else if (e.key === 'ArrowUp') this.highlight(this.active - 1);
    else if (e.key === 'Enter') {
      if (this.matches[this.active]) this.choose(this.matches[this.active]);
    } else if (e.key === 'Escape') this.input.blur();
    else return;
    e.preventDefault();
  }

  choose(option) {
    this.input.blur();
    this.value = option.value;
    this.close();
    this.setValue(option.value);
    this.onSelect(option.value);
  }
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

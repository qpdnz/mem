// ---- panel: 右の詳細 ----
function openPanel(content, t) {
  const panel = $('panel');
  $('panel-body').replaceChildren(content);
  panel.setAttribute('style', t ? toneStyle(t) : '');
  panel.hidden = false;
  panel.scrollTop = 0;
}

function closePanel() {
  $('panel').hidden = true;
}

function section(title, ...children) {
  const items = children.flat().filter(Boolean);
  if (!items.length) return null;
  return h('section', { class: 'p-sec' }, h('h3', { text: title }), items);
}

function textList(lines) {
  const items = (lines || []).filter(Boolean);
  return items.length ? h('ul', { class: 'p-list' }, items.map((line) => h('li', { text: line }))) : null;
}

function sourceSection(source) {
  const lines = [].concat(source || []).filter(Boolean);
  return lines.length ? section('出典', h('div', { class: 'p-source' }, lines.map((line) => h('div', { text: line })))) : null;
}

function jumpButton(label, view, sel) {
  if (!viewAvailable(view) || STATE.view === view || (view === 'concept' && STATE.view === 'er')) return null;
  return h('button', {
    type: 'button', class: 'p-jump', text: label,
    onclick: () => { switchView(view, { focusSelected: false }); selectItem(sel, { focus: true }); },
  });
}

function entityLink(entity, badge, sub) {
  const layer = LAYERS.get(entity.layer);
  return h('button', {
    type: 'button', class: 'p-link', style: toneStyle(entityTone(entity)),
    onclick: () => selectItem({ kind: 'entity', id: entity.id }, { focus: true }),
  },
  badge ? h('span', { class: 'p-card', text: badge }) : layer ? h('span', { class: 'p-chip', text: layer.short || layer.label }) : null,
  h('span', null,
    h('span', { class: 'p-lname', text: entity.name }), ' ',
    h('span', { class: 'p-lsub', text: sub ?? entity.physical ?? '' })));
}

function stepLink(step, sub) {
  const actor = ACTORS.get(step.actor);
  return h('button', {
    type: 'button', class: 'p-link', style: toneStyle(stepTone(step)),
    onclick: () => selectItem({ kind: 'step', id: step.id }, { focus: true }),
  },
  actor ? h('span', { class: 'p-chip', text: actor.label }) : null,
  h('span', null, h('span', { class: 'p-lname', text: step.title }), ' ', h('span', { class: 'p-lsub', text: sub || '' })));
}

function termLink(term) {
  return h('button', {
    type: 'button', class: 'p-link', style: toneStyle(termTone(term)),
    onclick: () => selectItem({ kind: 'term', id: term.id }, { focus: true }),
  },
  h('span', { class: 'p-chip', text: '用語' }),
  h('span', null, h('span', { class: 'p-lname', text: term.word }), ' ', h('span', { class: 'p-lsub', text: term.short || '' })));
}

function seeLink(id) {
  const kind = seeKind(id), item = seeItem(id);
  if (!item) return null;
  return kind === 'entity' ? entityLink(item) : kind === 'step' ? stepLink(item) : screenLink(item);
}

function screenLink(screen, sub) {
  return h('button', {
    type: 'button', class: 'p-link', style: toneStyle(screenTone(screen)),
    onclick: () => selectItem({ kind: 'screen', id: screen.id }, { focus: true }),
  },
  h('span', { class: 'p-chip', text: screen.no ? '画面 ' + screen.no : '画面' }),
  h('span', null, h('span', { class: 'p-lname', text: screen.title }), ' ', h('span', { class: 'p-lsub', text: sub ?? screen.route ?? '' })));
}

function fieldItem(field, hitKey) {
  const keys = fieldKeys(field);
  const target = field.ref ? ENTITIES.get(refEntityId(field.ref)) : null;
  const meta = [field.physical, field.type].filter(Boolean).join(' ')
    + (field.ref ? ' → ' + (target ? (target.physical || target.name) + (String(field.ref).includes('.') ? '.' + String(field.ref).split('.')[1] : '') : field.ref) : '')
    + (field.nullable ? ' ・ 空可' : '');
  return h('div', { class: 'p-field' + (hitKey && hitKey === fieldKeyOf(field) ? ' hit' : ''), 'data-field': fieldKeyOf(field) },
    h('div', { class: 'p-fname' }, field.name, keys.map(keyBadge),
      field.auto ? h('span', { class: 'p-flag', text: '未命名' }) : null,
      field.unused ? h('span', { class: 'p-flag', text: '未使用' }) : null),
    meta ? h('div', { class: 'p-fmeta', text: meta }) : null,
    field.values && field.values.length ? h('div', { class: 'p-values' }, field.values.map((value) => h('span', { text: value }))) : null,
    field.note ? h('div', { class: 'p-fnote', text: field.note }) : null);
}

function headBlock(pill, title, phys, summary, extra) {
  return h('div', { class: 'p-head' },
    h('span', { class: 'p-pill', text: pill }),
    h('h2', { class: 'p-title', text: title }),
    phys ? h('div', { class: 'p-phys', text: phys }) : null,
    summary ? h('p', { class: 'p-summary', text: summary }) : null,
    extra);
}

function entityPanel(entity, hitKey) {
  const layer = LAYERS.get(entity.layer);
  const fields = entity.fields || [];
  const relations = RELATIONS.filter((r) => r.from === entity.id || r.to === entity.id).map((r) => {
    const other = ENTITIES.get(r.from === entity.id ? r.to : r.from);
    if (!other) return null;
    const role = r.from === entity.id ? 'この実体が親' : 'この実体が子';
    return entityLink(other, r.card || '1:N', [r.label, role].filter(Boolean).join(' ／ '));
  });
  const steps = USES.stepsByEntity.get(entity.id) || [];
  const screens = USES.screensByEntity.get(entity.id) || [];
  return h('div', null,
    headBlock(layer ? layer.label : '実体', entity.name, entity.physical, entity.summary,
      jumpButton('概念図で見る', 'concept', { kind: 'entity', id: entity.id })),
    h('div', { class: 'p-body' },
      section(`項目 (${fields.length})`, fields.length ? fields.map((f) => fieldItem(f, hitKey)) : h('div', { class: 'p-lsub', text: '項目の定義なし' })),
      section('つながっている実体', relations),
      section('登場する業務', steps.map((step) => stepLink(step))),
      section('使う画面', screens.map((screen) => screenLink(screen))),
      textList(entity.notes) && section('補足', textList(entity.notes)),
      section('この図で使う言葉', (USES.termsByItem.get(entity.id) || []).map(termLink)),
      sourceSection(entity.source)));
}

// 用語の欄。「どっちの意味か」を意味より先に出す。初めて読む人が引っかかるのはそこ
function termPanel(term) {
  const mine = new Set(term.see || []);
  const others = [...TERMS.values()].filter((t) => t.id !== term.id && (t.see || []).some((id) => mine.has(id)));
  return h('div', null,
    headBlock('用語', term.word, term.reading || null, term.short,
      jumpButton('用語で見る', 'terms', { kind: 'term', id: term.id })),
    h('div', { class: 'p-body' },
      term.confuse ? section('まぎらわしい', h('p', { class: 'p-warn', text: term.confuse })) : null,
      term.means ? section('意味', h('p', { class: 'p-text', text: term.means })) : null,
      section('この地図のどこに出るか', (term.see || []).map(seeLink)),
      section('関係する語', others.map(termLink)),
      sourceSection(term.source)));
}

function stepPanel(step) {
  const actor = ACTORS.get(step.actor);
  const screen = step.screen && SCREENS.get(step.screen);
  const incoming = FLOW_LINKS.filter((l) => l.to === step.id || (l.both && l.from === step.id));
  const outgoing = FLOW_LINKS.filter((l) => l.from === step.id || (l.both && l.to === step.id));
  const neighbor = (link, self) => STEPS.get(link.from === self ? link.to : link.from);
  return h('div', null,
    headBlock('業務 ／ ' + (actor ? actor.label : '担当未定義'), step.title, null, step.summary,
      jumpButton('業務フローで見る', 'flow', { kind: 'step', id: step.id })),
    h('div', { class: 'p-body' },
      textList(step.does) && section('この段階ですること', textList(step.does)),
      section('使うデータ', (step.uses || []).map((id) => ENTITIES.get(id)).filter(Boolean).map((entity) => entityLink(entity))),
      screen ? section('画面', screenLink(screen)) : null,
      section('前の段階', incoming.map((l) => { const s = neighbor(l, step.id); return s && stepLink(s, l.label); })),
      section('次の段階', outgoing.map((l) => { const s = neighbor(l, step.id); return s && stepLink(s, l.label); })),
      section('この図で使う言葉', (USES.termsByItem.get(step.id) || []).map(termLink)),
      sourceSection(step.source)));
}

function screenPanel(screen) {
  const layer = LAYERS.get(screen.layer);
  const links = SCREEN_LINKS.filter((l) => l.from === screen.id || l.to === screen.id).map((l) => {
    const other = SCREENS.get(l.from === screen.id ? l.to : l.from);
    return other && screenLink(other, [l.from === screen.id ? '次へ' : '前から', l.label].filter(Boolean).join(' ・ '));
  });
  return h('div', null,
    headBlock('画面' + (layer ? ' ／ ' + layer.label : ''), screen.title, screen.route, screen.summary,
      jumpButton('画面UIで見る', 'screens', { kind: 'screen', id: screen.id })),
    h('div', { class: 'p-body' },
      textList(screen.does) && section('この画面ですること', textList(screen.does)),
      section('使うデータ', (screen.uses || []).map((id) => ENTITIES.get(id)).filter(Boolean).map((entity) => entityLink(entity))),
      section('つながる画面', links),
      section('登場する業務', (USES.stepsByScreen.get(screen.id) || []).map((step) => stepLink(step))),
      section('この図で使う言葉', (USES.termsByItem.get(screen.id) || []).map(termLink)),
      sourceSection(screen.source)));
}

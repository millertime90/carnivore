/* Carnivore Journey — UI logic. All persistence goes through Storage (storage.js). */
(() => {
  'use strict';

  // ───────── Helpers ─────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `d${Date.now()}${Math.random().toString(16).slice(2)}`);
  const todayISO = () => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };
  const fmtDate = (d) =>
    d
      ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      : 'No date set';
  const isZinc = (s) => /zinc/i.test(s.name);

  const HUNGER = ['None', 'Neutral', 'Mild', 'Moderate', 'Strong'];
  const ENERGY = ['Low', 'Neutral', 'Good', 'High'];
  const SEVERITY = ['', '1 · Very mild', '2 · Mild', '3 · Moderate', '4 · Strong', '5 · Severe'];
  const QUICK_SYMPTOMS = ['Headache', 'Loose / watery stools', 'Carb cravings', 'Fatigue', 'Brain fog', 'Muscle cramps', 'Nausea', 'Poor sleep', 'Bloating', 'Constipation'];
  const INTENSITY = ['Easy', 'Moderate', 'Hard'];

  let journal = { days: [], meta: {} };
  let editingId = null;

  const sortedDays = () => [...journal.days].sort((a, b) => a.dayNumber - b.dayNumber);

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function showConfirm(title, message, confirmText = 'Confirm', isDanger = false) {
    return new Promise((resolve) => {
      const modal = $('#confirmModal');
      $('#confirmModalTitle').textContent = title;
      $('#confirmModalMessage').textContent = message;
      const acceptBtn = $('#acceptConfirmModal');
      acceptBtn.textContent = confirmText;
      acceptBtn.className = isDanger ? 'btn danger sm' : 'btn primary sm';

      const onConfirm = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };

      function cleanup() {
        modal.hidden = true;
        acceptBtn.removeEventListener('click', onConfirm);
        $('#cancelConfirmModal').removeEventListener('click', onCancel);
        $('#closeConfirmModal').removeEventListener('click', onCancel);
      }

      acceptBtn.addEventListener('click', onConfirm);
      $('#cancelConfirmModal').addEventListener('click', onCancel);
      $('#closeConfirmModal').addEventListener('click', onCancel);
      modal.hidden = false;
    });
  }

  // ───────── Derived info ─────────
  function zincStatus() {
    const days = sortedDays();
    const last = days[days.length - 1];
    if (!last) return { take: true, text: 'Zinc: take today (first day).' };
    const tookZinc = (last.supplements || []).some((s) => isZinc(s) && s.taken);
    return tookZinc
      ? { take: false, text: `Zinc was taken on Day ${last.dayNumber} — skip today (every other day).` }
      : { take: true, text: `Zinc was skipped on Day ${last.dayNumber} — take it today.` };
  }

  function onPlanStreak() {
    let streak = 0;
    for (const d of sortedDays().reverse()) {
      if (!d.onPlan) break;
      streak++;
    }
    return streak;
  }

  function symptomCounts() {
    const map = new Map();
    for (const d of journal.days)
      for (const s of d.symptoms || []) {
        const key = s.name.trim();
        if (!key) continue;
        const k = key.toLowerCase();
        const cur = map.get(k) || { name: key, count: 0, days: [] };
        cur.count++;
        cur.days.push(d.dayNumber);
        map.set(k, cur);
      }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }

  // ───────── Render: header stats ─────────
  function renderStats() {
    const days = sortedDays();
    const z = zincStatus();
    $('#stats').innerHTML = `
      <div class="stat"><b>${days.length}</b><span>Days logged</span></div>
      <div class="stat"><b>${onPlanStreak()}</b><span>On-plan streak</span></div>
      <div class="stat ${z.take ? 'zinc-take' : 'zinc-skip'}"><b>${z.take ? 'Take' : 'Skip'}</b><span>Zinc next day</span></div>`;
  }

  // ───────── Render: stack ─────────
  function renderStack() {
    $('#stackGrid').innerHTML = STACK.map(
      (g, i) => `
      <article class="card stack-card">
        <div class="stack-top">
          <span class="icon">${g.icon}</span>
          <span class="step">STEP ${i + 1}</span>
        </div>
        <header>
          <h3>${esc(g.title)}</h3>
          <span class="when">${esc(g.when)}</span>
        </header>
        <ul class="stack-items">
          ${g.items
            .map(
              (it) => `<li>
                <span class="item-name">${esc(it.name)}</span>
                ${it.dose ? `<span class="dose">${esc(it.dose)}</span>` : '<span></span>'}
                ${it.note ? `<small>${esc(it.note)}</small>` : ''}
              </li>`
            )
            .join('')}
        </ul>
      </article>`
    ).join('');
  }

  // ───────── Render: days ─────────
  const ul = (items) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>` : '<p class="muted">—</p>');

  function fmtMeal(m) {
    const parts = [];
    if (m.steakOz) parts.push(`${esc(m.steakOz)} oz steak`);
    if (m.eggs) parts.push(`${esc(m.eggs)} egg${Number(m.eggs) === 1 ? '' : 's'}`);
    if (m.butterTbsp) parts.push(`${esc(m.butterTbsp)} tbsp butter`);
    if (m.notes) parts.push(esc(m.notes));
    return parts.join(' · ') || '—';
  }

  function renderDays() {
    const days = sortedDays();
    $('#dayCount').textContent = days.length;
    if (!days.length) {
      $('#dayList').innerHTML = '<p class="empty">No days logged yet. Use the form below to add your first day.</p>';
      return;
    }
    $('#dayList').innerHTML = days
      .map((d, idx) => {
        const f = d.food || {};
        const symptoms = (d.symptoms || []).map(
          (s) =>
            `<strong>${esc(s.name)}</strong>${s.severity ? `<span class="sev sev-${s.severity}">${s.severity}/5</span>` : ''}${
              s.notes ? ` — ${esc(s.notes)}` : ''
            }`
        );
        const symNotes = lines(d.symptomNotes).map((l) => `<p>${esc(l)}</p>`).join('');
        const food = [];
        if (f.drink) food.push(`<strong>Drink:</strong> ${esc(f.drink)}${f.waterOz ? ` (~${esc(f.waterOz)} fl oz)` : ''}`);
        (f.meals || []).forEach((m) => food.push(`<strong>${esc(m.label || 'Meal')}:</strong> ${fmtMeal(m)}`));
        const supps = (d.supplements || [])
          .map(
            (s) => `<li>${s.taken ? '<span class="tick">✓</span>' : '<span class="muted">✗</span>'}
              <span class="${s.taken ? '' : 'skip'}">${esc(s.name)}</span>
              <small>${esc(s.dose || '')}${s.timing ? ` · ${esc(s.timing)}` : ''}${s.taken ? '' : ' · skipped'}</small></li>`
          )
          .join('');
        const acts = (d.activity || []).map(
          (a) =>
            `<strong>${esc(a.type || 'Activity')}</strong>${a.amount ? ` — ${esc(a.amount)}` : ''}${
              a.intensity ? ` <span class="pill">${esc(a.intensity)}</span>` : ''
            }${a.notes ? `<br><small class="muted">${esc(a.notes)}</small>` : ''}`
        );
        const pill = (label, val) => (val ? `<span class="pill">${label}: ${esc(val)}</span>` : '');
        return `
        <details class="card day-card" ${idx === days.length - 1 ? 'open' : ''}>
          <summary>
            <span class="day-badge">Day ${esc(d.dayNumber)}</span>
            <span class="day-date">${fmtDate(d.date)}</span>
            <span class="pills">
              ${pill('Hunger', d.hunger)}${pill('Energy', d.energy)}
              ${d.onPlan ? '<span class="pill ok">On plan</span>' : '<span class="pill bad">Off plan</span>'}
              ${(d.symptoms || []).length ? `<span class="pill warn">${d.symptoms.length} symptom${d.symptoms.length > 1 ? 's' : ''}</span>` : ''}
            </span>
          </summary>
          <div class="day-body">
            <section><h4>🩺 Symptoms</h4>${symptoms.length ? ul(symptoms) : ''}${symNotes}${!symptoms.length && !symNotes ? '<p class="muted">None reported</p>' : ''}</section>
            <section><h4>🥩 Food Intake</h4>${ul(food)}${f.notes ? `<p class="muted">${esc(f.notes)}</p>` : ''}</section>
            <section><h4>💊 Supplements</h4>${supps ? `<ul class="supp-list">${supps}</ul>` : '<p class="muted">—</p>'}</section>
            <section><h4>🚶 Physical Activity</h4>${acts.length ? ul(acts) : '<p class="muted">No activity logged</p>'}</section>
            <section class="wide"><h4>🧠 Behavior / Mindset</h4>${ul(lines(d.mindset).map(esc))}</section>
          </div>
          <footer class="day-actions">
            <button class="btn ghost sm" data-edit="${esc(d.id)}" type="button">✎ Edit</button>
            <button class="btn ghost sm danger" data-del="${esc(d.id)}" type="button">🗑 Delete</button>
          </footer>
        </details>`;
      })
      .join('');
  }

  // ───────── Render: pattern ─────────
  let editingPattern = false;

  function renderPattern() {
    const days = sortedDays();
    $('#patternRange').textContent = days.length ? `(Day ${days[0].dayNumber} → Day ${days[days.length - 1].dayNumber})` : '';

    $('#patternTable').innerHTML = days.length
      ? `<thead><tr><th>Day</th><th>Hunger</th><th>Energy</th><th>Symptoms</th><th>Zinc</th><th>Activity</th><th>Plan</th></tr></thead>
         <tbody>${days
           .map((d) => {
             const zinc = (d.supplements || []).find(isZinc);
             return `<tr>
               <td><strong>${esc(d.dayNumber)}</strong></td>
               <td>${esc(d.hunger || '—')}</td>
               <td>${esc(d.energy || '—')}</td>
               <td>${(d.symptoms || []).map((s) => esc(s.name)).join(', ') || '—'}</td>
               <td>${zinc ? (zinc.taken ? '✓' : 'skipped') : '—'}</td>
               <td>${(d.activity || []).map((a) => esc([a.type, a.amount].filter(Boolean).join(' '))).join(', ') || '—'}</td>
               <td>${d.onPlan ? '<span class="pill ok">✓</span>' : '<span class="pill bad">✗</span>'}</td>
             </tr>`;
           })
           .join('')}</tbody>`
      : '<tbody><tr><td class="muted">No entries yet.</td></tr></tbody>';

    // Insights
    const insights = [];
    const onPlan = days.filter((d) => d.onPlan).length;
    insights.push({ cls: onPlan === days.length ? 'ok' : 'warn', title: 'Consistency', text: `${onPlan} of ${days.length} days on plan.` });

    const counts = symptomCounts();
    insights.push({
      cls: counts.length ? 'warn' : 'ok',
      title: 'Symptoms seen',
      text: counts.length ? counts.map((c) => `${esc(c.name)} (Day ${c.days.join(', ')})`).join(' · ') : 'None reported.',
    });

    // Zinc every-other-day check
    const zincDays = days.filter((d) => (d.supplements || []).some((s) => isZinc(s) && s.taken)).map((d) => d.dayNumber);
    const back2back = zincDays.filter((n, i) => i > 0 && n - zincDays[i - 1] === 1);
    insights.push({
      cls: back2back.length ? 'warn' : 'ok',
      title: 'Zinc (every other day)',
      text: back2back.length
        ? `Taken on consecutive days: Day ${back2back.map((n) => `${n - 1}–${n}`).join(', ')}.`
        : zincDays.length
          ? `On schedule — taken on Day ${zincDays.join(', ')}.`
          : 'Not taken yet.',
    });

    const active = days.filter((d) => (d.activity || []).length).length;
    insights.push({ cls: '', title: 'Active days', text: `${active} of ${days.length} days with logged activity.` });

    $('#insights').innerHTML = insights
      .map((i) => `<div class="card insight ${i.cls}"><h4>${i.title}</h4><p>${i.text}</p></div>`)
      .join('');

    // Notes (editable)
    const notes = journal.meta.patternNotes || {};
    $('#patternNotes').innerHTML = Object.entries(notes)
      .map(([title, text]) =>
        editingPattern
          ? `<div class="card note"><h4>${esc(title)}</h4><textarea data-note="${esc(title)}">${esc(text)}</textarea></div>`
          : `<div class="card note"><h4>${esc(title)}</h4>${ul(lines(text).map(esc))}</div>`
      )
      .join('');
    $('#editPattern').textContent = editingPattern ? '💾 Save notes' : 'Edit notes';
  }

  // ───────── Dynamic Narrative Synthesis ─────────
  function generateDynamicNarrative(days) {
    if (!days || !days.length) {
      return 'No days logged yet. Log your first day to begin tracking your carnivore journey.';
    }
    const count = days.length;
    const onPlanDays = days.filter((d) => d.onPlan).length;
    const streak = onPlanStreak();
    const pct = Math.round((onPlanDays / count) * 100);

    // 1. Milestone & Adherence
    let opening = '';
    if (count === 1) {
      opening = onPlanDays === 1
        ? 'You completed Day 1 cleanly, staying disciplined through your first 24 hours on carnivore.'
        : 'You completed Day 1 of your carnivore journey.';
    } else if (onPlanDays === count) {
      opening = `You have completed ${count} full days cleanly with 100% adherence to your carnivore protocol, staying disciplined through cravings and eating when hungry.`;
    } else {
      opening = `You have logged ${count} days on carnivore with ${onPlanDays} clean days (${pct}% on plan) and an active on-plan streak of ${streak} day${streak === 1 ? '' : 's'}.`;
    }

    // 2. Hunger & Cravings
    let hungerCraving = '';
    const firstHunger = days[0].hunger || 'mild';
    const recentDays = days.slice(-2);
    const recentHunger = recentDays.map((d) => d.hunger).filter(Boolean);
    const hasCravings = days.some((d) =>
      (d.symptoms || []).some((s) => /craving/i.test(s.name)) || /craving/i.test(d.mindset || '')
    );

    if (count >= 2) {
      const hungerDesc = recentHunger.length ? recentHunger[recentHunger.length - 1].toLowerCase() : 'neutral';
      if (hasCravings) {
        hungerCraving = `Hunger transitioned from ${firstHunger.toLowerCase()} early on to a more ${hungerDesc} state, while carb cravings were recognized as psychological cues and overcome without breaking the diet.`;
      } else {
        hungerCraving = `Hunger has remained steady and manageable, currently resting at a ${hungerDesc} baseline as your body adapts.`;
      }
    }

    // 3. Symptoms & Digestion
    let symSummary = '';
    const allSyms = symptomCounts();
    const recentSyms = [].concat(...recentDays.map((d) => (d.symptoms || []).map((s) => s.name.toLowerCase())));

    if (allSyms.length) {
      const topSyms = allSyms.slice(0, 3).map((s) => s.name.toLowerCase()).join(', ');
      if (count > 2 && recentSyms.length === 0) {
        symSummary = `Early adaptation brought typical transition symptoms like ${topSyms}, which have leveled out with no acute symptoms reported in the most recent days.`;
      } else {
        symSummary = `You experienced normal early-transition adaptation symptoms (${topSyms}), while keeping hydration and electrolytes in your routine.`;
      }
    } else {
      symSummary = 'No significant physical discomfort or adverse symptoms have been reported throughout the journey.';
    }

    // 4. Energy & Mood
    let energySummary = '';
    const recentEnergy = recentDays.map((d) => d.energy).filter(Boolean);
    const curEnergy = recentEnergy.length ? recentEnergy[recentEnergy.length - 1].toLowerCase() : 'neutral';
    energySummary = `Energy and mood have held at a steady, ${curEnergy} level without sudden drops.`;

    // 5. Stack & Routine Consistency
    let routineSummary = '';
    const z = zincStatus();
    const activeDays = days.filter((d) => (d.activity || []).length).length;
    const actText = activeDays ? `with physical activity logged across ${activeDays} day${activeDays > 1 ? 's' : ''}` : 'prioritizing adaptation and rest';
    routineSummary = `Your routine has remained stable with consistent steak and egg meals, salted bone broth (~30–40 fl oz with glutamine & creatine), and clean supplement timing (${z.take ? 'zinc due today' : 'zinc alternated cleanly'}), ${actText}.`;

    return [opening, hungerCraving, symSummary, energySummary, routineSummary].filter(Boolean).join(' ');
  }

  // ───────── Render: summary ─────────
  let editingSummary = false;

  function renderSummary() {
    const days = sortedDays();
    const isCustom = !!(journal.meta && journal.meta.useCustom);
    const dynamicText = generateDynamicNarrative(days);
    const textToShow = isCustom ? (journal.meta.customSummary || journal.meta.summary || '') : dynamicText;

    const badge = $('#summaryModeBadge');
    const resetBtn = $('#resetAutoSummary');
    const editBtn = $('#editSummary');

    if (isCustom) {
      badge.textContent = '📝 Custom Personal Summary';
      resetBtn.hidden = false;
      editBtn.textContent = editingSummary ? '💾 Save Custom' : '✎ Edit Custom';
    } else {
      badge.textContent = '✨ Live Dynamic Summary (Updates with each day)';
      resetBtn.hidden = true;
      editBtn.textContent = editingSummary ? '💾 Save Custom' : '✎ Custom Note';
    }

    $('#summaryBody').innerHTML = editingSummary
      ? `<textarea id="summaryText" rows="6" placeholder="Write your personal overall summary...">${esc(textToShow)}</textarea>`
      : `<p>${esc(textToShow) || '<span class="muted">No summary generated yet.</span>'}</p>`;

    const counts = symptomCounts();
    const onPlan = days.filter((d) => d.onPlan).length;
    $('#summaryAuto').textContent = days.length
      ? `Auto: ${days.length} day${days.length > 1 ? 's' : ''} logged · ${onPlan} on plan · current streak ${onPlanStreak()}${
          counts.length ? ` · most frequent symptom: ${counts[0].name}` : ''
        }.`
      : '';
  }

  function renderAll() {
    renderStats();
    renderDays();
    renderPattern();
    renderSummary();
  }

  // ───────── Form: dynamic rows ─────────
  const removeBtn = '<button type="button" class="icon-btn remove" title="Remove">✕</button>';
  const opts = (arr, sel) => arr.map((v) => `<option ${String(v) === String(sel) ? 'selected' : ''}>${esc(v)}</option>`).join('');

  function addRow(container, html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const el = tpl.content.firstElementChild;
    container.appendChild(el);
    return el;
  }

  function suppRow(s = {}, custom = false) {
    const el = addRow(
      $('#suppList'),
      `<div class="row supp-row ${s.taken === false ? 'unchecked' : ''}" data-zinc="${isZinc({ name: s.name || '' })}">
        <input type="checkbox" data-f="taken" ${s.taken === false ? '' : 'checked'} title="Taken" />
        <input type="text" data-f="name" value="${esc(s.name)}" placeholder="Supplement" ${custom ? '' : 'readonly'} />
        <input type="text" data-f="dose" value="${esc(s.dose)}" placeholder="Dose" />
        <input type="text" data-f="timing" value="${esc(s.timing)}" placeholder="Timing (e.g. 1st meal)" />
        ${custom ? removeBtn : '<span></span>'}
      </div>`
    );
    return el;
  }

  const mealRow = (m = {}) =>
    addRow(
      $('#mealList'),
      `<div class="row meal-row">
        <input type="text" data-f="label" value="${esc(m.label)}" placeholder="Meal" />
        <input type="number" data-f="steakOz" value="${esc(m.steakOz)}" min="0" step="0.5" placeholder="oz" />
        <input type="number" data-f="eggs" value="${esc(m.eggs)}" min="0" step="1" placeholder="#" />
        <input type="number" data-f="butterTbsp" value="${esc(m.butterTbsp)}" min="0" step="0.5" placeholder="tbsp" />
        <input type="text" data-f="notes" value="${esc(m.notes)}" placeholder="Other foods / notes" />
        ${removeBtn}
      </div>`
    );

  const symRow = (s = {}) =>
    addRow(
      $('#symList'),
      `<div class="row sym-row">
        <input type="text" data-f="name" value="${esc(s.name)}" placeholder="Symptom" />
        <select data-f="severity">${SEVERITY.map((v, i) => `<option value="${i || ''}" ${Number(s.severity) === i && i ? 'selected' : ''}>${v || 'Severity…'}</option>`).join('')}</select>
        <input type="text" data-f="notes" value="${esc(s.notes)}" placeholder="e.g. 2 times, ~30 min each" />
        ${removeBtn}
      </div>`
    );

  const actRow = (a = {}) =>
    addRow(
      $('#actList'),
      `<div class="row act-row">
        <input type="text" data-f="type" value="${esc(a.type)}" list="activityTypes" placeholder="Walk, lifting…" />
        <input type="text" data-f="amount" value="${esc(a.amount)}" placeholder="1 mile / 30 min" />
        <select data-f="intensity"><option value="">Intensity…</option>${opts(INTENSITY, a.intensity)}</select>
        <input type="text" data-f="notes" value="${esc(a.notes)}" placeholder="Notes" />
        ${removeBtn}
      </div>`
    );

  function readRows(container) {
    return $$('.row', container).map((row) => {
      const o = {};
      $$('[data-f]', row).forEach((el) => {
        o[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value.trim();
      });
      return o;
    });
  }

  function buildSegmented() {
    $$('.segmented').forEach((seg) => {
      const group = seg.dataset.group;
      const values = group === 'hunger' ? HUNGER : ENERGY;
      seg.innerHTML = values.map((v) => `<label><input type="radio" name="${group}" value="${v}" />${v}</label>`).join('');
    });
    $('#symChips').innerHTML = QUICK_SYMPTOMS.map((s) => `<button type="button" class="chip" data-sym="${esc(s)}">+ ${esc(s)}</button>`).join('');
  }

  function setRadio(name, value) {
    $$(`input[name="${name}"]`).forEach((r) => (r.checked = r.value === value));
  }

  // ───────── Form: fill / reset / collect ─────────
  function clearRows() {
    ['#suppList', '#mealList', '#symList', '#actList'].forEach((s) => ($(s).innerHTML = ''));
  }

  function resetForm() {
    editingId = null;
    const form = $('#dayForm');
    form.reset();
    clearRows();
    const days = sortedDays();
    form.dayNumber.value = days.length ? Math.max(...days.map((d) => d.dayNumber)) + 1 : 1;
    form.date.value = todayISO();
    form.onPlan.checked = true;
    form.drink.value = 'Bone broth + L-glutamine + creatine (1 scoop) in lightly salted water';
    form.waterOz.value = '30–40';
    setRadio('hunger', '');
    setRadio('energy', '');

    const z = zincStatus();
    SUPPLEMENTS.forEach((s) => suppRow({ ...s, taken: s.everyOtherDay ? z.take : true }));
    $('#zincHint').textContent = `💡 ${z.text}`;
    $('#zincHint').className = `hint ${z.take ? 'ok' : 'warn'}`;

    mealRow({ label: 'Meal 1', steakOz: 11, eggs: 3, butterTbsp: 1 });
    mealRow({ label: 'Meal 2', steakOz: 11, eggs: 2, butterTbsp: 1 });

    $('#formTitle').textContent = '➕ Log a Day';
    $('#saveBtn').textContent = 'Save Day';
    $('#cancelEdit').hidden = true;
    $$('.invalid', form).forEach((el) => el.classList.remove('invalid'));
  }

  function fillForm(day) {
    editingId = day.id;
    const form = $('#dayForm');
    form.reset();
    clearRows();
    const f = day.food || {};
    form.dayNumber.value = day.dayNumber;
    form.date.value = day.date || '';
    form.onPlan.checked = !!day.onPlan;
    setRadio('hunger', day.hunger);
    setRadio('energy', day.energy);
    form.drink.value = f.drink || '';
    form.waterOz.value = f.waterOz || '';
    form.foodNotes.value = f.notes || '';
    form.symptomNotes.value = day.symptomNotes || '';
    form.mindset.value = day.mindset || '';

    // Template supplements first (preserving recorded state), then any extras.
    const recorded = day.supplements || [];
    const templateNames = SUPPLEMENTS.map((s) => s.name.toLowerCase());
    SUPPLEMENTS.forEach((t) => {
      const r = recorded.find((s) => s.name.toLowerCase() === t.name.toLowerCase());
      suppRow(r ? { ...t, ...r } : { ...t, taken: false });
    });
    recorded.filter((s) => !templateNames.includes(s.name.toLowerCase())).forEach((s) => suppRow(s, true));
    $('#zincHint').textContent = '';

    (f.meals || []).forEach(mealRow);
    (day.symptoms || []).forEach(symRow);
    (day.activity || []).forEach(actRow);

    $('#formTitle').textContent = `✎ Editing Day ${day.dayNumber}`;
    $('#saveBtn').textContent = `Update Day ${day.dayNumber}`;
    $('#cancelEdit').hidden = false;
    $('#log').scrollIntoView();
  }

  function collectForm() {
    const form = $('#dayForm');
    const supplements = readRows($('#suppList'))
      .filter((s) => s.name)
      .map((s) => ({ name: s.name, dose: s.dose, timing: s.timing, taken: !!s.taken }));
    const meals = readRows($('#mealList'))
      .filter((m) => m.label || m.steakOz || m.eggs || m.butterTbsp || m.notes)
      .map((m) => ({ ...m, eggs: m.eggs === '' ? '' : Number(m.eggs) }));
    const symptoms = readRows($('#symList'))
      .filter((s) => s.name)
      .map((s) => ({ name: s.name, severity: s.severity ? Number(s.severity) : '', notes: s.notes }));
    const activity = readRows($('#actList')).filter((a) => a.type || a.amount);

    return {
      id: editingId || uid(),
      dayNumber: Number(form.dayNumber.value),
      date: form.date.value,
      onPlan: form.onPlan.checked,
      hunger: form.hunger.value || '',
      energy: form.energy.value || '',
      symptoms,
      symptomNotes: form.symptomNotes.value.trim(),
      food: { drink: form.drink.value.trim(), waterOz: form.waterOz.value.trim(), meals, notes: form.foodNotes.value.trim() },
      supplements,
      activity,
      mindset: form.mindset.value.trim(),
    };
  }

  function validate(day) {
    const input = $('#dayForm').dayNumber;
    input.classList.remove('invalid');
    if (!Number.isInteger(day.dayNumber) || day.dayNumber < 1) {
      input.classList.add('invalid');
      return 'Day # must be a whole number of 1 or more.';
    }
    if (journal.days.some((d) => d.dayNumber === day.dayNumber && d.id !== day.id)) {
      input.classList.add('invalid');
      return `Day ${day.dayNumber} already exists — edit it instead, or pick another number.`;
    }
    return null;
  }

  // ───────── Text summary export ─────────
  function fmtMealText(m) {
    const parts = [];
    if (m.steakOz) parts.push(`${m.steakOz} oz steak`);
    if (m.eggs) parts.push(`${m.eggs} egg${Number(m.eggs) === 1 ? '' : 's'}`);
    if (m.butterTbsp) parts.push(`${m.butterTbsp} tbsp butter`);
    if (m.notes) parts.push(m.notes);
    return parts.join(' · ') || '—';
  }

  function generateTextSummary() {
    const days = sortedDays();
    const z = zincStatus();
    const streak = onPlanStreak();
    const counts = symptomCounts();
    const onPlanCount = days.filter((d) => d.onPlan).length;
    const pctOnPlan = days.length ? Math.round((onPlanCount / days.length) * 100) : 0;
    const generatedAt = new Date().toLocaleString();

    let out = '';
    out += '==========================================================\n';
    out += ' CARNIVORE JOURNEY — OVERALL SUMMARY & LOG ARCHIVE\n';
    out += ` Generated: ${generatedAt}\n`;
    out += '==========================================================\n\n';

    out += '📊 QUICK STATS\n';
    out += '----------------------------------------------------------\n';
    out += `• Days Logged:       ${days.length}\n`;
    out += `• On-Plan Streak:    ${streak} day${streak === 1 ? '' : 's'}\n`;
    out += `• Adherence Rate:    ${onPlanCount}/${days.length} (${pctOnPlan}% on plan)\n`;
    out += `• Next Zinc Status:  ${z.take ? 'TAKE' : 'SKIP'} (${z.text})\n`;
    if (counts.length) {
      out += `• Symptoms Seen:     ${counts.map((c) => `${c.name} (${c.count}x)`).join(', ')}\n`;
    }
    out += '\n';

    out += '⭐ OVERALL CARNIVORE SUMMARY\n';
    out += '----------------------------------------------------------\n';
    const isCustom = !!(journal.meta && journal.meta.useCustom);
    const narrativeText = generateDynamicNarrative(days);
    if (isCustom && (journal.meta.customSummary || journal.meta.summary)) {
      out += `[Custom Summary]\n${journal.meta.customSummary || journal.meta.summary}\n\n`;
      out += `[Live Dynamic Synthesis]\n${narrativeText}\n\n`;
    } else {
      out += `${narrativeText}\n\n`;
    }
    if (days.length) {
      out += `Auto-metric: ${days.length} day${days.length > 1 ? 's' : ''} logged · ${onPlanCount} on plan · current streak ${streak}${
        counts.length ? ` · most frequent symptom: ${counts[0].name}` : ''
      }.\n\n`;
    }

    out += '⭐ OVERALL PATTERNS\n';
    out += '----------------------------------------------------------\n';
    const pNotes = (journal.meta && journal.meta.patternNotes) || {};
    for (const [category, noteText] of Object.entries(pNotes)) {
      out += `[${category}]\n`;
      for (const l of lines(noteText)) {
        out += `• ${l}\n`;
      }
      out += '\n';
    }

    out += '⭐ DAILY STACK TEMPLATE (REFERENCE ROUTINE)\n';
    out += '----------------------------------------------------------\n';
    STACK.forEach((g, idx) => {
      out += `Step ${idx + 1}: ${g.title} (${g.when})\n`;
      g.items.forEach((it) => {
        out += `  - ${it.name}${it.dose ? `: ${it.dose}` : ''}${it.note ? ` (${it.note})` : ''}\n`;
      });
      out += '\n';
    });

    out += '⭐ DAY-BY-DAY LOG ENTRIES\n';
    out += '----------------------------------------------------------\n';
    if (!days.length) {
      out += '(No days logged yet)\n\n';
    } else {
      days.forEach((d) => {
        out += `\n⭐ DAY ${d.dayNumber}${d.date ? ` — ${fmtDate(d.date)}` : ''}\n`;
        out += `Plan Status: ${d.onPlan ? 'Clean / On Plan' : 'Off Plan'}\n`;
        out += `Hunger:      ${d.hunger || 'Not recorded'}\n`;
        out += `Energy/Mood: ${d.energy || 'Not recorded'}\n\n`;

        out += 'Physical Symptoms:\n';
        const symList = d.symptoms || [];
        if (symList.length) {
          symList.forEach((s) => {
            out += `  • ${s.name}${s.severity ? ` (Severity: ${s.severity}/5)` : ''}${s.notes ? ` — ${s.notes}` : ''}\n`;
          });
        }
        if (d.symptomNotes) {
          lines(d.symptomNotes).forEach((l) => {
            out += `  • ${l}\n`;
          });
        }
        if (!symList.length && !d.symptomNotes) {
          out += '  • None reported\n';
        }
        out += '\n';

        out += 'Food Intake:\n';
        const f = d.food || {};
        if (f.drink) {
          out += `  • Pre-meal drink: ${f.drink}${f.waterOz ? ` (~${f.waterOz} fl oz)` : ''}\n`;
        }
        (f.meals || []).forEach((m) => {
          out += `  • ${m.label || 'Meal'}: ${fmtMealText(m)}\n`;
        });
        if (f.notes) {
          out += `  • Food notes: ${f.notes}\n`;
        }
        out += '\n';

        out += 'Supplements:\n';
        const supps = d.supplements || [];
        if (supps.length) {
          supps.forEach((s) => {
            out += `  • [${s.taken ? 'X' : ' '}] ${s.name}${s.dose ? ` (${s.dose})` : ''}${s.timing ? ` · ${s.timing}` : ''}${s.taken ? '' : ' · [SKIPPED]'}\n`;
          });
        } else {
          out += '  • None recorded\n';
        }
        out += '\n';

        out += 'Physical Activity:\n';
        const acts = d.activity || [];
        if (acts.length) {
          acts.forEach((a) => {
            out += `  • ${a.type || 'Activity'}${a.amount ? `: ${a.amount}` : ''}${a.intensity ? ` (${a.intensity})` : ''}${a.notes ? ` — ${a.notes}` : ''}\n`;
          });
        } else {
          out += '  • No activity logged\n';
        }
        out += '\n';

        out += 'Behavior / Mindset Diary:\n';
        if (d.mindset) {
          lines(d.mindset).forEach((l) => {
            out += `  • ${l}\n`;
          });
        } else {
          out += '  • No notes recorded\n';
        }
        out += '\n----------------------------------------------------------\n';
      });
    }

    return out;
  }

  function downloadTextSummary() {
    const text = generateTextSummary();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `carnivore_summary_${todayISO()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Downloaded summary text document.');
  }

  // ───────── Events ─────────
  function bindEvents() {
    const form = $('#dayForm');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const day = collectForm();
      const err = validate(day);
      if (err) return toast(`⚠ ${err}`);
      const wasEditing = !!editingId;
      journal = await Storage.saveDay(day);
      renderAll();
      resetForm();
      toast(wasEditing ? `Day ${day.dayNumber} updated.` : `Day ${day.dayNumber} saved.`);
      $('#days').scrollIntoView();
    });

    $('#cancelEdit').addEventListener('click', resetForm);
    $('#clearForm').addEventListener('click', resetForm);
    $('#addSupp').addEventListener('click', () => suppRow({ taken: true }, true).querySelector('[data-f="name"]').focus());
    $('#addMeal').addEventListener('click', () => mealRow({ label: `Meal ${$$('#mealList .row').length + 1}` }));
    $('#addSym').addEventListener('click', () => symRow().querySelector('input').focus());
    $('#addAct').addEventListener('click', () => actRow().querySelector('input').focus());

    $('#symChips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-sym]');
      if (!chip) return;
      const exists = readRows($('#symList')).some((s) => s.name.toLowerCase() === chip.dataset.sym.toLowerCase());
      if (exists) return toast(`${chip.dataset.sym} is already listed.`);
      symRow({ name: chip.dataset.sym }).querySelector('select').focus();
    });

    // Remove row + dim unchecked supplements
    form.addEventListener('click', (e) => {
      if (e.target.matches('.remove')) e.target.closest('.row').remove();
    });
    form.addEventListener('change', (e) => {
      if (e.target.matches('.supp-row [data-f="taken"]')) e.target.closest('.row').classList.toggle('unchecked', !e.target.checked);
    });

    // Day edit / delete
    $('#dayList').addEventListener('click', async (e) => {
      const editId = e.target.closest('[data-edit]')?.dataset.edit;
      const delId = e.target.closest('[data-del]')?.dataset.del;
      if (editId) {
        const day = journal.days.find((d) => d.id === editId);
        if (day) fillForm(day);
      } else if (delId) {
        const day = journal.days.find((d) => d.id === delId);
        if (day) {
          const ok = await showConfirm(
            'Delete Day',
            `Delete Day ${day.dayNumber}? This cannot be undone (export first if unsure).`,
            'Delete',
            true
          );
          if (ok) {
            journal = await Storage.deleteDay(delId);
            if (editingId === delId) resetForm();
            renderAll();
            toast(`Day ${day.dayNumber} deleted.`);
          }
        }
      }
    });

    $('#expandAll').addEventListener('click', () => $$('.day-card').forEach((d) => (d.open = true)));
    $('#collapseAll').addEventListener('click', () => $$('.day-card').forEach((d) => (d.open = false)));

    // Pattern notes edit/save
    $('#editPattern').addEventListener('click', async () => {
      if (editingPattern) {
        const notes = { ...journal.meta.patternNotes };
        $$('[data-note]').forEach((t) => (notes[t.dataset.note] = t.value));
        journal = await Storage.saveMeta({ patternNotes: notes });
        toast('Pattern notes saved.');
      }
      editingPattern = !editingPattern;
      renderPattern();
    });

    // Summary edit/save & reset
    $('#editSummary').addEventListener('click', async () => {
      if (editingSummary) {
        const val = $('#summaryText').value.trim();
        journal = await Storage.saveMeta({
          customSummary: val,
          useCustom: true,
          summary: val,
        });
        toast('Custom summary saved.');
      }
      editingSummary = !editingSummary;
      renderSummary();
    });

    $('#resetAutoSummary').addEventListener('click', async () => {
      journal = await Storage.saveMeta({ useCustom: false });
      editingSummary = false;
      renderSummary();
      toast('Switched back to live dynamic summary.');
    });

    // Export / import / reset
    $('#downloadTxtSummary').addEventListener('click', downloadTextSummary);
    $('#exportTxtBtn').addEventListener('click', downloadTextSummary);

    $('#exportBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(journal, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `carnivore_journal_${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $('#importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.days)) throw new Error('missing "days" array');
        const ok = await showConfirm(
          'Import Journal',
          `Replace current journal with ${data.days.length} day(s) from "${file.name}"? This will overwrite current entries and sync to your account.`,
          'Import',
          false
        );
        if (!ok) return;
        journal = await Storage.replaceAll({ version: 1, meta: {}, ...data });
        renderAll();
        resetForm();
        toast('Journal imported successfully.');
      } catch (err) {
        toast(`⚠ Import failed: ${err.message}`);
      }
    });

    $('#resetBtn').addEventListener('click', async () => {
      const ok = await showConfirm(
        'Reset Journal',
        'Reset everything to the original clean template? Any days you have added will be cleared (export first if unsure).',
        'Reset',
        true
      );
      if (!ok) return;
      journal = await Storage.reset();
      editingPattern = editingSummary = false;
      renderAll();
      resetForm();
      toast('Reset to blank template.');
    });

    // ───────── Auth Modal & Session Events ─────────
    const authModal = $('#authModal');
    const authBtn = $('#authBtn');
    const closeAuthModal = $('#closeAuthModal');
    const tabLogin = $('#tabLogin');
    const tabSignup = $('#tabSignup');
    const authForm = $('#authForm');
    const authSubmitBtn = $('#authSubmitBtn');
    const emailField = $('#emailField');
    const loggedInView = $('#loggedInView');
    const loggedOutView = $('#loggedOutView');
    const googleUsernameView = $('#googleUsernameView');
    const googleAuthBtn = $('#googleAuthBtn');
    const confirmGoogleUsernameBtn = $('#confirmGoogleUsernameBtn');
    const logoutBtn = $('#logoutBtn');

    let isSignupMode = false;
    let pendingGoogleCredential = null;

    function updateAuthNav() {
      const user = Storage.getUser();
      if (user) {
        authBtn.textContent = `👤 ${user.username}`;
        authBtn.title = `Logged in as ${user.username}`;
        if (typeof refreshFriendsData === 'function') refreshFriendsData();
      } else {
        authBtn.textContent = '👤 Account';
        authBtn.title = 'Sign In or Create Account';
        const b = $('#friendsBadge');
        if (b) b.hidden = true;
      }
    }

    function renderAuthModal() {
      const user = Storage.getUser();
      if (user) {
        loggedInView.hidden = false;
        loggedOutView.hidden = true;
        googleUsernameView.hidden = true;
        $('#userDisplayName').textContent = user.username;
        $('#userEmail').textContent = user.email || 'No email attached';
        $('#userAvatar').textContent = user.username.slice(0, 1).toUpperCase() || '🥩';
      } else {
        loggedInView.hidden = true;
        loggedOutView.hidden = false;
        googleUsernameView.hidden = true;
      }
    }

    authBtn.addEventListener('click', () => {
      renderAuthModal();
      authModal.hidden = false;
      setTimeout(initGoogleClient, 50);
    });

    closeAuthModal.addEventListener('click', () => {
      authModal.hidden = true;
    });

    authModal.addEventListener('click', (e) => {
      if (e.target === authModal) authModal.hidden = true;
    });

    tabLogin.addEventListener('click', () => {
      isSignupMode = false;
      tabLogin.classList.add('active');
      tabSignup.classList.remove('active');
      emailField.hidden = true;
      authSubmitBtn.textContent = 'Log In';
    });

    tabSignup.addEventListener('click', () => {
      isSignupMode = true;
      tabSignup.classList.add('active');
      tabLogin.classList.remove('active');
      emailField.hidden = false;
      authSubmitBtn.textContent = 'Create Account';
    });

    // Manual Login / Signup submission
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = $('#authUsername').value.trim();
      const password = $('#authPassword').value;
      const email = $('#authEmail').value.trim();

      try {
        if (isSignupMode) {
          await Storage.signupManual(username, password, email || null);
          toast(`Account created! Welcome, ${username}.`);
        } else {
          await Storage.loginManual(username, password);
          toast(`Welcome back, ${username}!`);
        }
        updateAuthNav();
        journal = await Storage.load();
        renderAll();
        authModal.hidden = true;
        authForm.reset();
      } catch (err) {
        toast(`⚠ ${err.message}`);
      }
    });

    const optGoogleName = $('#optGoogleName');
    const optCustomName = $('#optCustomName');
    const customUsernameInputWrap = $('#customUsernameInputWrap');
    const cancelGoogleBtn = $('#cancelGoogleBtn');
    const googleNamePreview = $('#googleNamePreview');
    let currentGooglePayload = null;

    optGoogleName.addEventListener('change', () => {
      customUsernameInputWrap.hidden = true;
    });

    optCustomName.addEventListener('change', () => {
      customUsernameInputWrap.hidden = false;
      $('#googleCustomUsername').focus();
    });

    cancelGoogleBtn.addEventListener('click', () => {
      googleUsernameView.hidden = true;
      loggedOutView.hidden = false;
      pendingGoogleCredential = null;
    });

    const GOOGLE_CLIENT_ID = '485627779695-pt90c7v33pqvhfisndkic4f5aa7sqmpa.apps.googleusercontent.com';

    // Parse payload from Google ID token JWT (base64url format)
    function parseJwtPayload(token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        return JSON.parse(jsonPayload);
      } catch (e) {
        return null;
      }
    }

    // Handle Google credential callback
    async function handleGoogleCredential(credential) {
      pendingGoogleCredential = credential;

      try {
        // Send token to server without custom handle to check if account already exists
        const res = await Storage.authGoogle(credential, null);

        // If existing user, log them in immediately!
        if (!res.isNewUser) {
          toast(`Welcome back, ${res.user.username}!`);
          updateAuthNav();
          journal = await Storage.load();
          renderAll();
          authModal.hidden = true;
          return;
        }

        // Only if it's a NEW user signup, show username choice
        const payload = parseJwtPayload(credential) || {};
        const googleName = res.googleName || payload.name || payload.given_name || 'carnivore_user';
        const googleEmail = res.email || payload.email || '';
        const suggested = res.suggestedUsername || 'carnivore_user';

        googleNamePreview.textContent = `${googleName}${googleEmail ? ` (${googleEmail})` : ''}`;
        $('#googleCustomUsername').value = suggested;
        optGoogleName.checked = true;
        customUsernameInputWrap.hidden = true;

        loggedOutView.hidden = true;
        googleUsernameView.hidden = false;
      } catch (err) {
        toast(`⚠ ${err.message}`);
      }
    }

    // Initialize Google Identity Services with FedCM support
    function initGoogleClient() {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          use_fedcm_for_prompt: true,
          callback: (response) => {
            if (response.credential) {
              handleGoogleCredential(response.credential);
            }
          },
        });

        const btnContainer = $('#googleButtonContainer');
        if (btnContainer && btnContainer.children.length === 0) {
          window.google.accounts.id.renderButton(btnContainer, {
            theme: 'filled_blue',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            width: 300,
          });
        }
      }
    }

    confirmGoogleUsernameBtn.addEventListener('click', async () => {
      const isCustom = optCustomName.checked;
      const customHandle = $('#googleCustomUsername').value.trim();

      if (isCustom && !customHandle) {
        return toast('Please enter a custom username.');
      }

      const chosenUsername = isCustom ? customHandle : $('#googleCustomUsername').value.trim();

      try {
        const res = await Storage.authGoogle(pendingGoogleCredential, chosenUsername);
        toast(`Signed in as ${res.user.username}!`);
        updateAuthNav();
        journal = await Storage.load();
        renderAll();
        authModal.hidden = true;
      } catch (err) {
        toast(`⚠ ${err.message}`);
      }
    });

    logoutBtn.addEventListener('click', async () => {
      exitObserverMode();
      Storage.logout();
      updateAuthNav();
      journal = await Storage.load();
      editingPattern = editingSummary = false;
      renderAll();
      resetForm();
      authModal.hidden = true;
      toast('Logged out. Switched to clean slate.');
    });

    // ───────── Friends & Accountability UI Logic ─────────
    const friendsModal = $('#friendsModal');
    const friendsBtn = $('#friendsBtn');
    const closeFriendsModal = $('#closeFriendsModal');
    const friendsBadge = $('#friendsBadge');
    const tabRequestsBadge = $('#tabRequestsBadge');
    const tabMyFriends = $('#tabMyFriends');
    const tabFriendRequests = $('#tabFriendRequests');
    const tabAddFriend = $('#tabAddFriend');
    const panelMyFriends = $('#panelMyFriends');
    const panelFriendRequests = $('#panelFriendRequests');
    const panelAddFriend = $('#panelAddFriend');
    const addFriendForm = $('#addFriendForm');
    const friendsList = $('#friendsList');
    const requestsList = $('#requestsList');

    const leadModal = $('#leadModal');
    const closeLeadModal = $('#closeLeadModal');
    const leadPartnerName = $('#leadPartnerName');
    const leadPartnerName2 = $('#leadPartnerName2');
    const acceptWithShareBtn = $('#acceptWithShareBtn');
    const acceptWithoutShareBtn = $('#acceptWithoutShareBtn');

    const observerBanner = $('#observerBanner');
    const observerUsername = $('#observerUsername');
    const exitObserverBtn = $('#exitObserverBtn');

    let myOwnJournal = null;
    let isObserverMode = false;
    let pendingLeadRequestId = null;

    async function refreshFriendsData() {
      if (!Storage.isLoggedIn()) {
        friendsBadge.hidden = true;
        tabRequestsBadge.hidden = true;
        return;
      }

      try {
        const data = await Storage.getFriends();
        const incomingCount = (data.incomingFriendRequests?.length || 0) + (data.incomingAccountabilityRequests?.length || 0);

        if (incomingCount > 0) {
          friendsBadge.textContent = incomingCount;
          friendsBadge.hidden = false;
          tabRequestsBadge.textContent = incomingCount;
          tabRequestsBadge.hidden = false;
        } else {
          friendsBadge.hidden = true;
          tabRequestsBadge.hidden = true;
        }

        // Render My Friends
        if (!data.friends || data.friends.length === 0) {
          friendsList.innerHTML = '<p class="muted small" style="text-align: center; padding: 1.5rem 0;">No friends yet. Add friends using the "+ Add Friend" tab!</p>';
        } else {
          friendsList.innerHTML = data.friends
            .map((f) => {
              let statusLabel = '<span class="friend-status">Friend</span>';
              if (f.accountabilityStatus === 'active') {
                statusLabel = '<span class="friend-status buddy">⭐ Accountability Buddy</span>';
              } else if (f.accountabilityStatus === 'request_sent') {
                statusLabel = '<span class="friend-status">⏳ Request Pending</span>';
              } else if (f.accountabilityStatus === 'request_received') {
                statusLabel = '<span class="friend-status buddy">📬 Request Waiting</span>';
              }

              const viewBtn = f.canViewJournal
                ? `<button class="btn primary sm" data-view-journal="${f.id}" data-username="${esc(f.username)}">👁 View Journal</button>`
                : '';

              const reqAccBtn = !f.accountabilityStatus
                ? `<button class="btn ghost sm" data-req-accountability="${esc(f.username)}" title="Request Accountability Buddy">🤝 Accountability</button>`
                : '';

              return `
              <div class="friend-card">
                <div class="friend-info">
                  <div class="friend-avatar">${esc(f.username.slice(0, 1).toUpperCase())}</div>
                  <div class="friend-meta">
                    <p class="friend-username">@${esc(f.username)}</p>
                    ${statusLabel}
                  </div>
                </div>
                <div class="friend-actions">
                  ${viewBtn}
                  ${reqAccBtn}
                  <button class="icon-btn sm" data-remove-friend="${f.id}" data-username="${esc(f.username)}" title="Remove Friend">✕</button>
                </div>
              </div>`;
            })
            .join('');
        }

        // Render Requests
        const friendReqs = data.incomingFriendRequests || [];
        const accReqs = data.incomingAccountabilityRequests || [];

        if (friendReqs.length === 0 && accReqs.length === 0) {
          requestsList.innerHTML = '<p class="muted small" style="text-align: center; padding: 1.5rem 0;">No pending requests.</p>';
        } else {
          const reqHtml = [];

          friendReqs.forEach((r) => {
            reqHtml.push(`
            <div class="request-card">
              <div class="friend-info">
                <div class="friend-avatar">${esc(r.username.slice(0, 1).toUpperCase())}</div>
                <div class="friend-meta">
                  <p class="friend-username">@${esc(r.username)}</p>
                  <span class="friend-status">Wants to be friends</span>
                </div>
              </div>
              <div class="friend-actions">
                <button class="btn primary sm" data-accept-friend="${r.id}">Accept</button>
                <button class="btn ghost sm" data-decline-friend="${r.id}">Decline</button>
              </div>
            </div>`);
          });

          accReqs.forEach((r) => {
            reqHtml.push(`
            <div class="request-card">
              <div class="friend-info">
                <div class="friend-avatar">${esc(r.username.slice(0, 1).toUpperCase())}</div>
                <div class="friend-meta">
                  <p class="friend-username">@${esc(r.username)}</p>
                  <span class="friend-status buddy">Wants you as Accountability Buddy</span>
                </div>
              </div>
              <div class="friend-actions">
                <button class="btn primary sm" data-accept-accountability="${r.id}" data-username="${esc(r.username)}">Review &amp; Accept</button>
                <button class="btn ghost sm" data-decline-accountability="${r.id}">Decline</button>
              </div>
            </div>`);
          });

          requestsList.innerHTML = reqHtml.join('');
        }
      } catch (err) {
        console.warn('Failed to load friends overview:', err.message);
      }
    }

    // Switch Tabs in Friends Modal
    function switchFriendsTab(tab) {
      tabMyFriends.classList.toggle('active', tab === 'friends');
      tabFriendRequests.classList.toggle('active', tab === 'requests');
      tabAddFriend.classList.toggle('active', tab === 'add');

      panelMyFriends.hidden = tab !== 'friends';
      panelFriendRequests.hidden = tab !== 'requests';
      panelAddFriend.hidden = tab !== 'add';
    }

    tabMyFriends.addEventListener('click', () => switchFriendsTab('friends'));
    tabFriendRequests.addEventListener('click', () => switchFriendsTab('requests'));
    tabAddFriend.addEventListener('click', () => switchFriendsTab('add'));

    friendsBtn.addEventListener('click', () => {
      if (!Storage.isLoggedIn()) {
        toast('Please log in or create an account to use Friends & Buddies.');
        authModal.hidden = false;
        return;
      }
      switchFriendsTab('friends');
      friendsModal.hidden = false;
      refreshFriendsData();
    });

    closeFriendsModal.addEventListener('click', () => {
      friendsModal.hidden = true;
    });

    friendsModal.addEventListener('click', (e) => {
      if (e.target === friendsModal) friendsModal.hidden = true;
    });

    // Send Friend Request
    addFriendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = $('#addFriendUsername').value.trim();
      if (!username) return;
      try {
        const res = await Storage.sendFriendRequest(username);
        toast(res.message);
        addFriendForm.reset();
        switchFriendsTab('friends');
        refreshFriendsData();
      } catch (err) {
        toast(`⚠ ${err.message}`);
      }
    });

    // Friends list click actions (Request accountability, View journal, Remove friend)
    friendsList.addEventListener('click', async (e) => {
      const reqAccTarget = e.target.closest('[data-req-accountability]')?.dataset.reqAccountability;
      const removeFriendId = e.target.closest('[data-remove-friend]')?.dataset.removeFriend;
      const removeFriendName = e.target.closest('[data-remove-friend]')?.dataset.username;
      const viewJournalId = e.target.closest('[data-view-journal]')?.dataset.viewJournal;
      const viewJournalName = e.target.closest('[data-view-journal]')?.dataset.username;

      if (reqAccTarget) {
        const ok = await showConfirm(
          'Request Accountability Buddy',
          `Request @${reqAccTarget} for help keeping accountability? They will be granted full access to view your daily logs, streaks, meals, and symptoms to help you stay on plan.`,
          'Send Request'
        );
        if (!ok) return;
        try {
          const res = await Storage.sendAccountabilityRequest(reqAccTarget);
          toast(res.message);
          refreshFriendsData();
        } catch (err) {
          toast(`⚠ ${err.message}`);
        }
      } else if (removeFriendId) {
        const ok = await showConfirm(
          'Remove Friend',
          `Remove @${removeFriendName} from your friends list? Any accountability partnership between you will also end.`,
          'Remove',
          true
        );
        if (!ok) return;
        try {
          const res = await Storage.removeFriend(removeFriendId);
          toast(res.message);
          refreshFriendsData();
        } catch (err) {
          toast(`⚠ ${err.message}`);
        }
      } else if (viewJournalId) {
        enterObserverMode(viewJournalId, viewJournalName);
      }
    });

    // Requests list click actions (Accept / decline friend, Review accountability)
    requestsList.addEventListener('click', async (e) => {
      const acceptFriendId = e.target.closest('[data-accept-friend]')?.dataset.acceptFriend;
      const declineFriendId = e.target.closest('[data-decline-friend]')?.dataset.declineFriend;
      const acceptAccId = e.target.closest('[data-accept-accountability]')?.dataset.acceptAccountability;
      const acceptAccName = e.target.closest('[data-accept-accountability]')?.dataset.username;
      const declineAccId = e.target.closest('[data-decline-accountability]')?.dataset.declineAccountability;

      if (acceptFriendId) {
        try {
          const res = await Storage.respondFriendRequest(acceptFriendId, true);
          toast(res.message);
          refreshFriendsData();
        } catch (err) {
          toast(`⚠ ${err.message}`);
        }
      } else if (declineFriendId) {
        try {
          const res = await Storage.respondFriendRequest(declineFriendId, false);
          toast(res.message);
          refreshFriendsData();
        } catch (err) {
          toast(`⚠ ${err.message}`);
        }
      } else if (acceptAccId) {
        // Open Lead by Example modal
        pendingLeadRequestId = acceptAccId;
        leadPartnerName.textContent = acceptAccName;
        leadPartnerName2.textContent = acceptAccName;
        leadModal.hidden = false;
      } else if (declineAccId) {
        try {
          const res = await Storage.respondAccountability(declineAccId, false);
          toast(res.message);
          refreshFriendsData();
        } catch (err) {
          toast(`⚠ ${err.message}`);
        }
      }
    });

    // Lead by Example Modal responses
    closeLeadModal.addEventListener('click', () => {
      leadModal.hidden = true;
    });

    leadModal.addEventListener('click', (e) => {
      if (e.target === leadModal) leadModal.hidden = true;
    });

    acceptWithShareBtn.addEventListener('click', async () => {
      if (!pendingLeadRequestId) return;
      try {
        const res = await Storage.respondAccountability(pendingLeadRequestId, true, true);
        toast(res.message);
        leadModal.hidden = true;
        refreshFriendsData();
      } catch (err) {
        toast(`⚠ ${err.message}`);
      }
    });

    acceptWithoutShareBtn.addEventListener('click', async () => {
      if (!pendingLeadRequestId) return;
      try {
        const res = await Storage.respondAccountability(pendingLeadRequestId, true, false);
        toast(res.message);
        leadModal.hidden = true;
        refreshFriendsData();
      } catch (err) {
        toast(`⚠ ${err.message}`);
      }
    });

    // Observer Mode logic
    async function enterObserverMode(targetUserId, username) {
      try {
        const res = await Storage.fetchBuddyJournal(targetUserId);
        myOwnJournal = journal;
        isObserverMode = true;
        journal = res.journal || { days: [], meta: {} };

        friendsModal.hidden = true;
        observerUsername.textContent = username;
        observerBanner.hidden = false;
        document.body.classList.add('observer-mode');

        renderAll();
        resetForm();
        $('#days').scrollIntoView();
        toast(`Now viewing @${username}'s journal.`);
      } catch (err) {
        toast(`⚠ ${err.message}`);
      }
    }

    function exitObserverMode() {
      if (!isObserverMode) return;
      isObserverMode = false;
      journal = myOwnJournal || { days: [], meta: {} };
      myOwnJournal = null;

      observerBanner.hidden = true;
      document.body.classList.remove('observer-mode');

      renderAll();
      resetForm();
      toast('Returned to your own journal.');
    }

    exitObserverBtn.addEventListener('click', exitObserverMode);

    // Check existing session on boot
    Storage.checkSession().then(() => updateAuthNav());
  }

  // ───────── Init ─────────
  async function init() {
    buildSegmented();
    renderStack();
    journal = await Storage.load();
    journal.meta = journal.meta || {};
    renderAll();
    resetForm();
    bindEvents();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

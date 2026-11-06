/**
 * BALI TRIP PLANNER — ЛОГИКА ПРИЛОЖЕНИЯ
 * -----------------------------------------------------------
 * Здесь находятся расчёты, работа форм, сохранение в браузере.
 * Тексты страницы меняются в index.html, цвета — в styles.css.
 * Ключ localStorage оставлен прежним: baliTripPlannerV2.
 *
 * Разделы:
 *   1. Константы и настройки
 *   2. Начальные данные и загрузка
 *   3. Расчёт стоимости
 *   4. Отображение интерфейса
 *   5. Обработка действий и сохранение
 */
(() => {
    'use strict';
    const $ = id => document.getElementById(id), fmtRub = n => Math.round(n).toLocaleString('ru-RU') + ' ₽', fmtUsd = n => '$' + Math.round(n).toLocaleString('en-US'), clone = x => JSON.parse(JSON.stringify(x));
    // 1. СПРАВОЧНИКИ: статусы, сценарии, категории расходов и чек-лист
    const statusOptions = [['neutral', 'Не обсуждали'], ['discussion', 'Обсуждаем'], ['approved', 'Согласовано'], ['rejected', 'Отклонено']];
    const bookingOptions = [['notbooked', 'Не забронировано'], ['booked', 'Забронировано'], ['paid', 'Оплачено']];
    const scenarioNames = { economy: 'Экономный', optimal: 'Оптимальный', comfort: 'Комфорт' };
    const categories = [['cafe', 'Кафе и рестораны', 'person_day'], ['excursions', 'Экскурсии', 'person_trip'], ['entertainment', 'Развлечения', 'person_trip'], ['transfers', 'Трансферы и такси', 'group_trip'], ['other', 'Прочие расходы', 'person_trip']];
    const checks = [['passport', 'Проверить паспорт и срок действия'], ['visa', 'Проверить визу / e-VOA / VOA для своего гражданства'], ['arrival', 'Проверить и заполнить декларацию прибытия'], ['tax', 'Проверить и оплатить туристический сбор Бали'], ['insurance', 'Оформить медицинскую страховку'], ['tickets', 'Сохранить билеты и подтверждения бронирований'], ['money', 'Подготовить деньги, карты и обмен валюты'], ['internet', 'Подключить eSIM или местную SIM'], ['transfer', 'Организовать трансфер аэропорт → Убуд'], ['health', 'Собрать аптечку, SPF и репеллент'], ['packing', 'Собрать одежду, дождевик и нужные адаптеры']];
    const amount = (v, c) => ({ v, c });
    const flightLeg = () => ({ airline: '', number: '', from: '', to: '', departure: '', arrival: '', stops: '0', connections: '', layover: '', duration: '', baggage: '', url: '', status: 'neutral', booking: 'notbooked' });
    const home = (v, uv, wv, daily) => ({ flight: amount(v, 'RUB'), ubud: { price: amount(uv, 'USD'), name: '', url: '', status: 'neutral', booking: 'notbooked' }, uluwatu: { price: amount(wv, 'USD'), name: '', url: '', status: 'neutral', booking: 'notbooked' }, legs: { out: flightLeg(), back: flightLeg() }, expenses: { cafe: { price: amount(daily, 'USD'), basis: 'person_day' }, excursions: { price: amount(100, 'USD'), basis: 'person_trip' }, entertainment: { price: amount(80, 'USD'), basis: 'person_trip' }, transfers: { price: amount(180, 'USD'), basis: 'group_trip' }, other: { price: amount(50, 'USD'), basis: 'person_trip' } }, reserve: 10 });
    // 2. НАЧАЛЬНЫЕ ДАННЫЕ: даты, бюджет и три сценария
    const defaults = { departure: '2026-12-25', arrival: '2026-12-26', return: '2027-01-15', home: '2027-01-16', ubudNights: 10, rate: 85, people: 3, budget: 250000, scenario: 'optimal', scenarios: { economy: home(80000, 900, 1100, 25), optimal: home(110000, 1500, 1900, 45), comfort: home(150000, 2600, 3200, 75) }, checks: {} };
    let state = clone(defaults);
    try {
        if (location.hash.startsWith('#plan=')) {
            const raw = decodeURIComponent(location.hash.slice(6));
            state = { ...clone(defaults), ...JSON.parse(decodeURIComponent(escape(atob(raw)))) };
            history.replaceState(null, '', location.pathname + location.search);
        }
        else {
            const saved = localStorage.getItem('baliTripPlannerV2');
            if (saved)
                state = { ...clone(defaults), ...JSON.parse(saved) };
        }
    }
    catch (e) {
        console.warn('Could not load saved data', e);
    }
    if (!state.scenarios || !state.scenarios[state.scenario])
        state = clone(defaults);
    const save = () => { try {
        localStorage.setItem('baliTripPlannerV2', JSON.stringify(state));
    }
    catch (e) {
        console.warn(e);
    } };
    const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const val = n => Math.max(0, Number(n) || 0);
    const rate = () => Math.max(.01, val(state.rate));
    const toRub = p => p.c === 'USD' ? val(p.v) * rate() : val(p.v);
    const toUsd = p => toRub(p) / rate();
    const dayDiff = (a, b) => { const x = Date.parse(a + 'T12:00:00Z'), y = Date.parse(b + 'T12:00:00Z'); return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 86400000) : 0; };
    const nights = () => Math.max(0, dayDiff(state.arrival, state.return));
    // 3. РАСЧЁТ СТОИМОСТИ: валюта, расходы и резерв
    /** Считает стоимость одной категории в зависимости от количества людей и дней. */
    function expenseMultiplier(basis, people, days) {
        switch (basis) {
            case 'person_day': return people * days;
            case 'person_trip': return people;
            case 'group_day': return days;
            default: return 1;
        }
    }

    /** Возвращает смету сценария в рублях: статьи, резерв, итог и цену на человека. */
    function calc(scenarioId) {
        const scenario = state.scenarios[scenarioId];
        const people = val(state.people);
        const days = nights();
        const parts = {
            flight: toRub(scenario.flight) * people,
            ubud: toRub(scenario.ubud.price),
            uluwatu: toRub(scenario.uluwatu.price)
        };

        for (const [key, , defaultBasis] of categories) {
            const expense = scenario.expenses[key];
            const basis = expense.basis || defaultBasis;
            parts[key] = toRub(expense.price) * expenseMultiplier(basis, people, days);
        }

        const subtotal = Object.values(parts).reduce((sum, cost) => sum + cost, 0);
        const reserve = subtotal * val(scenario.reserve) / 100;
        const total = subtotal + reserve;
        return { parts, subtotal, reserve, total, per: total / people };
    }

    const priceEditor = (p, path) => `<input aria-label="Стоимость" type="number" min="0" step="0.01" value="${escape(p.v)}" data-price="${path}"><select aria-label="Валюта" data-currency="${path}"><option value="USD" ${p.c === 'USD' ? 'selected' : ''}>USD $</option><option value="RUB" ${p.c === 'RUB' ? 'selected' : ''}>RUB ₽</option></select><div class="hint">${fmtRub(toRub(p))}<br>${fmtUsd(toUsd(p))}</div>`;
    const options = (arr, selected) => arr.map(([v, l]) => `<option value="${v}" ${selected === v ? 'selected' : ''}>${l}</option>`).join('');
    const statusControls = (path, obj) => `<div class="grid" style="margin-top:12px"><div><label>Согласование</label><select data-field="${path}.status">${options(statusOptions, obj.status)}</select></div><div><label>Бронирование / оплата</label><select data-field="${path}.booking">${options(bookingOptions, obj.booking)}</select></div></div>`;
    const getPath = path => path.split('.').reduce((o, k) => o[k], state);
    const setPath = (path, v) => { const keys = path.split('.'); let o = state; for (const k of keys.slice(0, -1))
        o = o[k]; o[keys[keys.length - 1]] = v; };
    // 4. ОТРИСОВКА: финансовая сводка и динамические формы
    /**
     * Финансовая сводка. Положительный остаток — спокойный зелёный статус,
     * превышение бюджета — красный. Синий остаётся цветом интерактивных элементов.
     */
    function summary() {
        const estimate = calc(state.scenario);
        const budget = val(state.budget);
        const difference = budget - estimate.per;
        const withinBudget = difference >= 0;
        const percentage = budget ? Math.min(100, estimate.per / budget * 100) : 100;
        const statusClass = withinBudget ? 'good' : 'bad';
        const statusLabel = withinBudget ? 'Остаток' : 'Превышение';

        return `
            <div class="grid">
                <div class="summary">
                    <small>На человека</small>
                    <div class="big">${fmtRub(estimate.per)}</div>
                    <div class="sub">${fmtUsd(estimate.per / rate())}</div>
                </div>
                <div class="summary">
                    <small>На всю компанию (${state.people} чел.)</small>
                    <div class="big">${fmtRub(estimate.total)}</div>
                    <div class="sub">${fmtUsd(estimate.total / rate())}</div>
                </div>
            </div>
            <div class="row wrap budget-status-row">
                <span>Сценарий: <strong>${scenarioNames[state.scenario]}</strong></span>
                <span class="budget-status ${statusClass}">
                    <strong>${statusLabel}: ${fmtRub(Math.abs(difference))} / чел.</strong>
                </span>
            </div>
            <div class="progress">
                <div class="${withinBudget ? 'progress-success' : 'progress-danger'}"
                     style="width:${percentage}%"></div>
            </div>
            <div class="row budget-progress-caption">
                <small>Бюджет ${fmtRub(budget)} / чел.</small>
                <small>${budget ? Math.round(estimate.per / budget * 100) + '% бюджета' : 'Бюджет не задан'}</small>
            </div>`;
    }

    function renderOverview() { const d = nights(), u = Math.min(d, Math.max(0, val(state.ubudNights))); $('nightText').textContent = d + ' ночей'; $('ubudNights').max = d; $('ubudNights').value = u; $('ubudText').textContent = 'Убуд: ' + u + ' ночей'; $('uluwatuText').textContent = 'Улувату: ' + (d - u) + ' ночей'; $('dateError').style.display = dayDiff(state.arrival, state.return) <= 0 ? 'block' : 'none'; $('heroDays').textContent = d + ' ночей'; $('heroPeople').textContent = state.people + ' чел.'; $('heroCost').textContent = fmtRub(calc(state.scenario).per); $('topSummary').innerHTML = summary(); $('bottomSummary').innerHTML = summary(); $('tabs').innerHTML = Object.keys(scenarioNames).map(id => { const c = calc(id); return `<button class="tab ${id === state.scenario ? 'active' : ''}" data-scenario="${id}"><strong>${scenarioNames[id]}</strong><span>${fmtRub(c.per)}</span><small>${fmtUsd(c.per / rate())} / чел.</small></button>`; }).join(''); document.querySelectorAll('[data-scenario-name]').forEach(e => e.textContent = scenarioNames[state.scenario]); const c = calc(state.scenario), names = { flight: 'Перелёты', ubud: 'Жильё · Убуд', uluwatu: 'Жильё · Улувату', cafe: 'Кафе и рестораны', excursions: 'Экскурсии', entertainment: 'Развлечения', transfers: 'Трансферы', other: 'Прочее' }; $('breakdown').innerHTML = Object.entries(c.parts).map(([k, v]) => `<div class="row" class="breakdown-row"><span>${names[k]}</span><strong>${fmtRub(v)} <small> / ${fmtUsd(v / rate())}</small></strong></div>`).join('') + `<div class="row" style="padding:10px 0"><span>Резерв (${state.scenarios[state.scenario].reserve}%)</span><strong>${fmtRub(c.reserve)}</strong></div><div class="row"><strong>ИТОГО</strong><strong>${fmtRub(c.total)} / ${fmtUsd(c.total / rate())}</strong></div>`; }
    function flightForm(leg, key, label) { const path = `scenarios.${state.scenario}.legs.${key}`; const f = (k, l, type = 'text') => `<div><label>${l}</label><input type="${type}" data-field="${path}.${k}" value="${escape(leg[k])}"></div>`; return `<div class="flight"><h3>${label}</h3><div class="flightgrid">${f('airline', 'Авиакомпания')}${f('number', 'Номер рейса')}${f('from', 'Откуда (аэропорт)')}${f('to', 'Куда (аэропорт)')}${f('departure', 'Вылет, местное время', 'datetime-local')}${f('arrival', 'Прилёт, местное время', 'datetime-local')}${f('stops', 'Количество пересадок', 'number')}${f('connections', 'Где пересадки')}${f('layover', 'Длительность пересадок')}${f('duration', 'Общее время в пути')}${f('baggage', 'Багаж')}${f('url', 'Ссылка на билет', 'url')}</div>${statusControls(path, leg)}</div>`; }
    function renderDetail() { const id = state.scenario, s = state.scenarios[id], base = 'scenarios.' + id; $('flightPrice').innerHTML = `<div class="fieldrow"><div><strong>Перелёт туда-обратно</strong><div class="hint">Стоимость на одного человека</div></div>${priceEditor(s.flight, base + '.flight')}</div>`; $('flights').innerHTML = flightForm(s.legs.out, 'out', 'Москва → Денпасар (DPS)') + flightForm(s.legs.back, 'back', 'Денпасар (DPS) → Москва'); $('housing').innerHTML = [['ubud', 'Убуд'], ['uluwatu', 'Улувату']].map(([key, label]) => { const h = s[key], path = base + '.' + key; return `<div class="flight"><h3>${label} · ${key === 'ubud' ? Math.min(nights(), val(state.ubudNights)) : Math.max(0, nights() - val(state.ubudNights))} ночей</h3><div class="grid"><div><label>Название жилья</label><input data-field="${path}.name" value="${escape(h.name)}"></div><div><label>Ссылка на объект</label><input type="url" data-field="${path}.url" value="${escape(h.url)}"></div></div><div class="fieldrow" style="margin-top:15px"><div><strong>Полная стоимость на компанию</strong></div>${priceEditor(h.price, path + '.price')}</div>${statusControls(path, h)}</div>`; }).join(''); $('expenses').innerHTML = categories.map(([key, label, def]) => { const e = s.expenses[key], path = base + '.expenses.' + key; return `<div class="expense"><div class="expensegrid"><div><strong>${label}</strong><div class="hint">${e.basis === 'person_day' ? 'На человека в день' : e.basis === 'person_trip' ? 'На человека за поездку' : e.basis === 'group_day' ? 'На компанию в день' : 'На компанию за поездку'}</div></div><input type="number" min="0" step="0.01" data-price="${path}.price" value="${escape(e.price.v)}"><select data-currency="${path}.price">${options([['USD', 'USD $'], ['RUB', 'RUB ₽']], e.price.c)}</select><select data-field="${path}.basis">${options([['person_day', 'Чел. / день'], ['person_trip', 'Чел. / поездка'], ['group_day', 'Компания / день'], ['group_trip', 'Компания / поездка']], e.basis)}</select></div><small>Итого: ${fmtRub(calc(id).parts[key])} / ${fmtUsd(calc(id).parts[key] / rate())}</small></div>`; }).join(''); $('reserve').value = s.reserve; }
    function renderChecks() { const done = checks.filter(([id]) => state.checks[id]).length; $('checkProgress').textContent = done + ' / ' + checks.length; $('checkBar').style.width = (done / checks.length * 100) + '%'; $('checklist').innerHTML = checks.map(([id, label]) => `<label class="check ${state.checks[id] ? 'done' : ''}"><input type="checkbox" data-check="${id}" ${state.checks[id] ? 'checked' : ''}><span>${label}</span></label>`).join(''); }
    function renderAll() { ['departure', 'arrival', 'return', 'home', 'rate', 'people', 'budget'].forEach(k => $(k).value = state[k]); renderOverview(); renderDetail(); renderChecks(); save(); }
    // 5. СОБЫТИЯ: каждая группа действий вынесена в отдельную функцию.

    /** Меняет количество ночей, сохраняя пропорцию Убуд / Улувату. */
    function preserveNightsRatio(previousNights, previousUbudNights) {
        const newNights = nights();
        if (newNights !== previousNights) {
            state.ubudNights = previousNights > 0
                ? Math.round(newNights * previousUbudNights / previousNights)
                : Math.round(newNights / 2);
        }
    }

    /** Сдвигает связанную дату на столько же дней, что и исходную. */
    function shiftDate(dateString, offsetDays) {
        const date = new Date(dateString + 'T12:00:00Z');
        date.setUTCDate(date.getUTCDate() + offsetDays);
        return date.toISOString().slice(0, 10);
    }

    /** Обновляет даты перелёта и распределение ночей после изменения календаря. */
    function updateTravelDate(field, newDate) {
        const previousNights = nights();
        const previousUbudNights = val(state.ubudNights);
        const previousDate = state[field];
        state[field] = newDate;

        if (field === 'departure' && previousDate && state.arrival) {
            state.arrival = shiftDate(state.arrival, dayDiff(previousDate, newDate));
        }
        if (field === 'home' && previousDate && state.return) {
            state.return = shiftDate(state.return, dayDiff(previousDate, newDate));
        }
        preserveNightsRatio(previousNights, previousUbudNights);
    }

    /** Сохраняет выбор валюты, конвертируя уже введённую сумму. */
    function updateCurrency(path, newCurrency) {
        const price = getPath(path);
        if (price.c === newCurrency) return;
        const converted = newCurrency === 'USD' ? toUsd(price) : toRub(price);
        price.v = Math.round(converted * 100) / 100;
        price.c = newCurrency;
    }

    /** Изменения обычных полей: даты, бюджет, курс, число участников и резерв. */
    function updateMainField(field, value) {
        if (field === 'reserve') {
            state.scenarios[state.scenario].reserve = Math.min(100, val(value));
        } else if (field === 'ubudNights') {
            state.ubudNights = val(value);
        } else if (['rate', 'people', 'budget'].includes(field)) {
            state[field] = val(value);
        } else if (['departure', 'arrival', 'return', 'home'].includes(field)) {
            updateTravelDate(field, value);
        }
    }

    /** Маршрутизирует события полей к соответствующим обработчикам. */
    function handleFieldChange(event) {
        const target = event.target;
        if (target.dataset.check) {
            state.checks[target.dataset.check] = target.checked;
            renderChecks();
            save();
            return;
        }
        if (target.dataset.scenario) {
            state.scenario = target.dataset.scenario;
        } else if (target.dataset.currency) {
            updateCurrency(target.dataset.currency, target.value);
        } else if (target.dataset.price) {
            getPath(target.dataset.price).v = val(target.value);
        } else if (target.dataset.field) {
            setPath(target.dataset.field, target.value);
        } else if (['departure', 'arrival', 'return', 'home', 'rate', 'people',
                    'budget', 'ubudNights', 'reserve'].includes(target.id)) {
            updateMainField(target.id, target.value);
        } else {
            return;
        }
        renderAll();
    }

    /** Ползунок обновляется сразу во время перетаскивания, без ожидания отпускания. */
    function handleSliderInput(event) {
        if (event.target.id !== 'ubudNights') return;
        state.ubudNights = val(event.target.value);
        renderOverview();
        save();
    }

    /** Переключает сценарий по нажатию на карточку. */
    function handleScenarioClick(event) {
        const button = event.target.closest('[data-scenario]');
        if (!button) return;
        state.scenario = button.dataset.scenario;
        renderAll();
    }

    /** Создаёт ссылку-снимок текущего плана (не синхронизацию). */
    async function sharePlan() {
        try {
            const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
            const url = location.href.split('#')[0] + '#plan=' + encodeURIComponent(encoded);
            await navigator.clipboard.writeText(url);
            alert('Ссылка со снимком плана скопирована. Это не синхронизация в реальном времени.');
        } catch (error) {
            alert('Не удалось скопировать ссылку. Попробуйте открыть сайт по HTTPS.');
        }
    }

    /** Скачивает резервную копию данных пользователя в формате JSON. */
    function exportPlan() {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'bali-trip-plan.json';
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    document.addEventListener('change', handleFieldChange);
    document.addEventListener('input', handleSliderInput);
    document.addEventListener('click', handleScenarioClick);
    $('share').addEventListener('click', sharePlan);
    $('export').addEventListener('click', exportPlan);

    renderAll();
})();
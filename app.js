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

    /** Перерисовывает верхнюю сводку, сценарии и детализацию бюджета. */
    function renderOverview() {
        const days = nights();
        const ubudDays = Math.min(days, val(state.ubudNights));
        $('nightText').textContent = days + ' ночей';
        $('ubudNights').max = days;
        $('ubudNights').value = ubudDays;
        $('ubudText').textContent = 'Убуд: ' + ubudDays + ' ночей';
        $('uluwatuText').textContent = 'Улувату: ' + (days - ubudDays) + ' ночей';
        $('dateError').style.display = dayDiff(state.arrival, state.return) <= 0 ? 'block' : 'none';
        $('heroDays').textContent = days + ' ночей';
        $('heroPeople').textContent = state.people + ' чел.';
        $('heroCost').textContent = fmtRub(calc(state.scenario).per);
        $('topSummary').innerHTML = summary();
        $('bottomSummary').innerHTML = summary();
        $('tabs').innerHTML = Object.keys(scenarioNames).map(id => {
            const cost = calc(id);
            return `<button class="tab ${id === state.scenario ? 'active' : ''}" data-scenario="${id}" aria-pressed="${id === state.scenario}"><strong>${scenarioNames[id]}</strong><span>${fmtRub(cost.per)}</span><small>${fmtUsd(cost.per / rate())} / чел.</small></button>`;
        }).join('');
        document.querySelectorAll('[data-scenario-name]').forEach(element => {
            element.textContent = scenarioNames[state.scenario];
            element.dataset.scenario = state.scenario;
        });
        const estimate = calc(state.scenario);
        const names = { flight: 'Перелёты', ubud: 'Жильё · Убуд', uluwatu: 'Жильё · Улувату', cafe: 'Кафе и рестораны', excursions: 'Экскурсии', entertainment: 'Развлечения', transfers: 'Трансферы', other: 'Прочее' };
        $('breakdown').innerHTML = Object.entries(estimate.parts).map(([key, cost]) => `<div class="row breakdown-row"><span>${names[key]}</span><strong>${fmtRub(cost)} <small> / ${fmtUsd(cost / rate())}</small></strong></div>`).join('') + `<div class="row breakdown-row"><span>Резерв (${state.scenarios[state.scenario].reserve}%)</span><strong>${fmtRub(estimate.reserve)}</strong></div><div class="row breakdown-row"><strong>ИТОГО</strong><strong>${fmtRub(estimate.total)} / ${fmtUsd(estimate.total / rate())}</strong></div>`;
    }

    /** Одно дополнительное поле для сведений о рейсе. */
    function flightField(path, leg, key, label, type = 'text') {
        return `<div><label>${label}</label><input type="${type}" ${type === 'number' ? 'min="0"' : ''} data-field="${path}.${key}" value="${escape(leg[key])}"></div>`;
    }

    /** Компактный рейс: дополнительные поля раскрываются нативным details. */
    function flightForm(leg, key, label, date) {
        const path = `scenarios.${state.scenario}.legs.${key}`;
        const fields = [
            flightField(path, leg, 'airline', 'Авиакомпания'),
            flightField(path, leg, 'number', 'Номер рейса'),
            flightField(path, leg, 'from', 'Аэропорт отправления'),
            flightField(path, leg, 'to', 'Аэропорт прибытия'),
            flightField(path, leg, 'departure', 'Вылет, местное время', 'datetime-local'),
            flightField(path, leg, 'arrival', 'Прилёт, местное время', 'datetime-local'),
            flightField(path, leg, 'stops', 'Количество пересадок', 'number'),
            flightField(path, leg, 'connections', 'Где пересадки'),
            flightField(path, leg, 'layover', 'Длительность пересадок'),
            flightField(path, leg, 'duration', 'Общее время в пути'),
            flightField(path, leg, 'baggage', 'Багаж'),
            flightField(path, leg, 'url', 'Ссылка на билет', 'url')
        ].join('');
        const info = [leg.airline, leg.number].filter(Boolean).join(' · ') || 'Авиакомпания и номер рейса не указаны';
        return `<details class="flight-accordion" data-panel="flight-${key}"><summary class="flight-accordion-trigger"><span><strong>${label}</strong><small>${escape(date)} · ${escape(info)}</small></span><span class="accordion-chevron" aria-hidden="true">⌄</span></summary><div class="flight-accordion-body"><div class="flightgrid">${fields}</div>${statusControls(path, leg)}</div></details>`;
    }

    /** Основное поле цены: число, валюта и эквивалент в рублях и долларах. */
    function prominentPrice(price, path, title, description) {
        return `<div class="prominent-price"><div class="price-caption"><strong>${title}</strong><small>${description}</small></div><div class="prominent-price-fields">${priceEditor(price, path)}</div></div>`;
    }

    /** Жильё: главное — полная стоимость; ссылка раскрывается по нажатию. */
    function housingCard(key, label, scenario, base) {
        const home = scenario[key];
        const path = base + '.' + key;
        const count = key === 'ubud' ? Math.min(nights(), val(state.ubudNights)) : Math.max(0, nights() - val(state.ubudNights));
        const link = home.url ? `<a class="saved-property-link" href="${escape(home.url)}" target="_blank" rel="noopener noreferrer">Открыть объект ↗</a>` : '';
        return `<article class="housing-card"><div class="housing-heading"><h3>${label}</h3><span class="pill">${count} ночей</span></div>${prominentPrice(home.price, path + '.price', 'Полная стоимость на компанию', 'За все ночи, не за одну ночь')}<div class="housing-secondary"><label>Название жилья</label><input data-field="${path}.name" value="${escape(home.name)}" placeholder="Отель, вилла или апартаменты"><details class="property-link" data-panel="property-${key}" ${home.url ? 'open' : ''}><summary>${home.url ? 'Изменить ссылку на объект' : '+ Добавить ссылку на объект'}</summary><div class="property-link-field"><label>Ссылка на жильё</label><input type="url" data-field="${path}.url" value="${escape(home.url)}" placeholder="https://..."></div></details>${link}<details class="housing-options" data-panel="housing-options-${key}"><summary>Согласование и бронирование</summary>${statusControls(path, home)}</details></div></article>`;
    }

    /** Сохраняет открытые панели при пересчёте и изменении полей. */
    function rememberOpenPanels() {
        return new Set([...document.querySelectorAll('details[data-panel][open]')].map(element => element.dataset.panel));
    }
    function restoreOpenPanels(openPanels) {
        document.querySelectorAll('details[data-panel]').forEach(element => {
            if (openPanels.has(element.dataset.panel)) element.open = true;
        });
    }

    /** Редактируемые детали текущего сценария. */
    function renderDetail() {
        const openPanels = rememberOpenPanels();
        const id = state.scenario;
        const scenario = state.scenarios[id];
        const base = 'scenarios.' + id;
        $('flightPrice').innerHTML = prominentPrice(scenario.flight, base + '.flight', 'Перелёт туда-обратно', 'Стоимость билетов на одного человека');
        $('flights').innerHTML = flightForm(scenario.legs.out, 'out', 'Москва → Денпасар', state.departure) + flightForm(scenario.legs.back, 'back', 'Денпасар → Москва', state.return);
        $('housing').innerHTML = housingCard('ubud', 'Убуд', scenario, base) + housingCard('uluwatu', 'Улувату', scenario, base);
        $('expenses').innerHTML = categories.map(([key, label]) => {
            const expense = scenario.expenses[key], path = base + '.expenses.' + key;
            const basisLabel = { person_day: 'На человека в день', person_trip: 'На человека за поездку', group_day: 'На компанию в день', group_trip: 'На компанию за поездку' }[expense.basis];
            return `<div class="expense"><div class="expensegrid"><div><strong>${label}</strong><div class="hint">${basisLabel}</div></div><input type="number" min="0" step="0.01" data-price="${path}.price" value="${escape(expense.price.v)}"><select data-currency="${path}.price">${options([['USD', 'USD $'], ['RUB', 'RUB ₽']], expense.price.c)}</select><select data-field="${path}.basis">${options([['person_day', 'Чел. / день'], ['person_trip', 'Чел. / поездка'], ['group_day', 'Компания / день'], ['group_trip', 'Компания / поездка']], expense.basis)}</select></div><small>Итого: ${fmtRub(calc(id).parts[key])} / ${fmtUsd(calc(id).parts[key] / rate())}</small></div>`;
        }).join('');
        $('reserve').value = scenario.reserve;
        restoreOpenPanels(openPanels);
    }
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
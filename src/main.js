// 차원의 균열 시뮬레이터 — 화면 흐름
import { DH, WHIRL, EQUIP, EQUIP_OPTS, EQUIP_IMG, SLOT_OF, EQ_SLOTS, UNITS, CLASS_KEYS, NPC_KEYS, tierFor, TIERS, tierOf, LEVEL_TIER, IMG, ALTARS, ALTAR_KEYS, GRADES, GRADE_COLORS, LEGACIES, ULTIMATES, ASCENSION, ROOM_INFO, FLOOR_ZONE } from './data.js';
import * as G from './game.js';
import { Battle, cellToPos } from './sim.js';
import { View } from './view.js';
import * as M from './meta.js';
import { AZENA as AZENA_DEF, INANNA as INANNA_DEF } from './data.js';
import * as A from './acc.js';
// 재화 · 회복 아이콘 (2026-10-31 3차, 첨부 이미지)
const coinIco = '<img class="coin-i" src="img/coin.png" alt="재화">';
const HEAL_IMG = 'img/heal.png', COIN_IMG = 'img/coin.png';

const $ = (s, r = document) => r.querySelector(s);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const ROOM_NAME = (t) => ROOM_INFO[t]?.name || t;

let view, run = null, battle = null, mode = 'title', speed = 1, devOn = false;
const app = $('#app'), screen = $('#screen'), hud = $('#hud'), modalRoot = $('#modal');

// ───────── 공통 UI ─────────
function modal(html, cls = '') {
  modalRoot.innerHTML = ''; const m = h(`<div class="mbg"><div class="mbox ${cls}">${html}</div></div>`);
  modalRoot.appendChild(m); return m;
}
function closeModal() { modalRoot.innerHTML = ''; }
function toast(msg, color = '#fff') {
  const t = h(`<div class="toast" style="color:${color}">${msg}</div>`); app.appendChild(t); setTimeout(() => t.remove(), 2000);
}
function hpLine(u = run.unit) {
  const s = G.computeStats(run, u); const hp = Math.round(s.maxHp * u.hpPct);
  return { hp, max: s.maxHp, pct: u.hpPct };
}
function partyHtml() {
  return run.units.map((u, i) => { const hp = hpLine(u), U = UNITS[u.key];
    return `<div class="unitbox${i ? ' sub' : ''}"><img src="${U.img}"><div class="ub">
      <div class="un">${U.name} <small>Lv.${u.level}${U.cls ? ' · ' + (run.roster[u.key] || '') : ' · NPC'}${i === 0 ? ' · 주 캐릭터' : ' · 동료'}</small></div>
      <div class="bar hp"><i style="width:${hp.pct * 100}%"></i><span>${hp.hp.toLocaleString()} / ${hp.max.toLocaleString()}</span></div>
      <div class="bar xp"><i style="width:${u.level >= G.MAX_LEVEL ? 100 : u.exp}%"></i></div></div></div>`; }).join('');
}

// 선택 카드 모달. opts: [{title, sub, desc, color, badge, apply}], gen: 리롤 시 새 선택지 생성
function choose({ title, sub = '', options, gen = null, skip = '건너뛰기', onDone }) {
  const render = (opts) => {
    const m = modal(`<div class="mt">${title}</div>${sub ? `<div class="ms">${sub}</div>` : ''}
      <div class="cards">${opts.map((o, i) => `<button class="card" data-i="${i}" style="--c:${o.color || '#e0703a'}">
        ${o.badge ? `<span class="badge" style="background:${o.badgeColor || o.color}">${o.badge}</span>` : ''}${o.img ? `<img class="cimg" src="${o.img}">` : ''}${o.html || ''}
        <b>${o.title}</b>${o.sub ? `<em>${o.sub}</em>` : ''}<p>${o.desc || ''}</p></button>`).join('')}</div>
      <div class="mrow">${gen && run.rerolls > 0 ? `<button class="btn ghost" id="rr">선택지 리롤 (${run.rerolls})</button>` : ''}
      ${skip ? `<button class="btn ghost" id="sk">${skip}</button>` : ''}</div>`);
    m.querySelectorAll('.card').forEach(b => b.onclick = async () => { closeModal(); await opts[+b.dataset.i].apply(); onDone?.(); });
    const rr = $('#rr', m); if (rr) rr.onclick = () => { run.rerolls--; render(gen()); };
    const sk = $('#sk', m); if (sk) sk.onclick = () => { closeModal(); onDone?.(); };
  };
  render(options);
}
const wait = (fn) => new Promise(res => fn(res));

// ───────── 보상 조각 ─────────
function equipOption(it) {
  const tc = ['', '#c9c9c9', '#5aa0ff', '#ffb84a'][it.tier];
  return { title: G.equipName(it), sub: `${it.tier}티어 ${EQUIP[it.kind].slot}`, desc: G.equipText(it), img: EQUIP_IMG(it.kind, it.tier), color: tc, badge: `${it.tier}티어`,
    apply: () => { if (G.addToBag(run, it)) toast(`${G.equipName(it)} 획득 · 대기 단계에서 장착`, tc); else toast(`가방이 가득 차 재화 +${G.sellPrice(it)}로 바꿨습니다`, '#ffd166'); } };
}
// 낙원 유물(향로·호각…) 보상: 등급은 층별 확률. 더 높은 등급이면 등급업, 아니면 복원석
// 유물 아이콘: 등급 = 배경색
function relicIcon(k, g, cls = '') { return `<span class="ricon rg${g} ${cls}"><img src="${M.RELIC_IMG(k)}" alt=""></span>`; }
function paradiseOption() {
  const key = G.pick(M.RELIC_KEYS), gr = M.rollGrade(run.floor), D = M.RELIC_DEF[key];
  return { title: D.name, html: relicIcon(key, gr, 'card'), color: M.GRADE_COL[gr],
    apply: () => {
      const m = M.loadMeta(), r = M.gainParadise(m, key, gr); run.meta = { ...run.meta, ...M.metaBonus(m) }; (run.paraGot = run.paraGot || []).push({ key, grade: gr }); // 점수 환산용
      toast(r.up ? `${D.name} 등급업 · ${M.GRADES[r.from]} → ${M.GRADES[r.to]}` : `${D.name} · 복원석 +${r.stones}`, M.GRADE_COL[gr]);
    } };
}
function expOption(n, sub = '') { return { title: `경험치 +${n}`, desc: run.units.length > 1 ? `파티 인원으로 나눠 1인당 ${Math.round(G.expShare(run, n))}` : sub, color: '#7ec8ff', apply: () => { const up = G.gainExp(run, n); if (up) toast(`레벨 업! Lv.${run.unit.level}`, '#7ee08a'); } }; }
// 장신구 획득 (가방이 가득 차면 재화로)
function gainAcc(it, why = '') {
  codexMark('accs', A.accId(it));
  if (G.addToBag(run, it)) toast(`${why}${A.ACC_GRADES[it.grade]} ${A.accName(it)} 획득`, A.ACC_GRADE_COL[it.grade]);
  else toast(`가방이 가득 차 재화 +${G.sellPrice(it)}로 바꿨습니다`, '#ffd166');
}
async function accReward(title, o = {}) {
  const it = G.makeAcc(run.floor, o);
  await wait(done => { const m = modal(`<div class="mt">${title}</div><div class="ms">장신구 1개를 얻었습니다</div>
    <div class="accgain"><span class="ricon ${A.ACC_GRADE_BG[it.grade]} big"><img src="${A.accImg(it)}"></span><b style="color:${A.ACC_GRADE_COL[it.grade]}">${A.ACC_GRADES[it.grade]} · ${A.accName(it)}</b><p>${A.accLines(it).map(l => `<span${l.tier != null ? ` style="color:${A.OPT_TIER_COL[l.tier]}"` : ''}>${l.text}${l.tier != null ? ` (${A.OPT_TIER[l.tier]})` : ''}</span>`).join('<br>')}</p></div>
    <div class="mrow"><button class="btn" id="ok">받기</button></div>`); $('#ok', m).onclick = () => { closeModal(); gainAcc(it); done(); }; });
}
function coinOption(n) { return { title: `재화 +${n}`, img: COIN_IMG, color: '#ffd166', apply: () => { run.coins += n; } }; }

// 동료·클래스 한 줄 설명 (영입 창 · 도감)
function unitDesc(k) { return ({
    Sorceress: '스킬: 종말의 날 (적이 가장 많은 3×3칸에 운석)',
    DevilHunter: '기본 공격 횟수로 건 스탠스 순환 (핸드건 → 샷건 → 라이플)',
    Breaker: '수라결 게이지가 차면 수라결 연타 · 1730부터 마나가 차면 징벌의 파도',
    Bard: '기본: 사운드 쇼크 / 스킬: 수호의 연주 (아군 전체 보호막) · 1730 절실한 구원 · 1750 용맹의 세레나데',
    Shana: '스킬: 섬광 (가까운 적 4명 베기 후 가장 먼 적 뒤로 순간이동)',
    Lahart: '스킬: 수호의 창 (아군 쪽으로 이동해 범위 안 아군 피해를 대신 받고, 끝나면 받은 피해 일부 반격)',
    Azena: '아제나: 고대의 창 3개 → 이난나로 변신 / 이난나: 세계수로 아군 전체 회복 → 아제나로',
    Federico: '스킬: 신성한 광선 (공중에 떠올라 전방 5칸 폭으로 3초간 광선)',
    Neria: '기본: 체력이 가장 낮은 아군 회복 / 스킬: 아군 전체 회복',
    Aman: '기본: 성스러운 빛 / 스킬: 수호의 기도 (근처에서 아군이 가장 많이 모인 3×3칸 아군에게 보호막)',
    Silian: '스킬: 검의 해방 (일정 시간 기본 공격이 전방 베기로 바뀜)',
    Hidaka: '스킬: 도끼 회전 (주위 연속 공격)',
  })[k] || ''; }
// ───────── 메뉴 → 낙원 → 차원의 균열 ─────────
// ───────── 도감 (만난 동료·클래스, 얻은 장신구) — 브라우저에 저장 ─────────
const CODEX_KEY = 'rift_codex';
function loadCodex() { try { const c = JSON.parse(localStorage.getItem(CODEX_KEY) || 'null'); if (c) return { units: {}, accs: {}, ...c }; } catch {} return { units: {}, accs: {} }; }
function saveCodex(c) { try { localStorage.setItem(CODEX_KEY, JSON.stringify(c)); } catch {} }
function codexMark(kind, id) { const c = loadCodex(); if (c[kind][id]) return; c[kind][id] = 1; saveCodex(c); }
// ───────── 프로필 (원정대 아이템 레벨 · 선택 캐릭터) ─────────
let profile = null;
function getProfile() {
  if (!profile) {
    let sv = {}; try { sv = JSON.parse(localStorage.getItem('rift_opts') || '{}'); } catch {}
    profile = { roster: { DevilHunter: 1775, Sorceress: 1760, Breaker: 1760, Bard: 1775, ...(sv.roster || {}) }, main: CLASS_KEYS.includes(sv.main) ? sv.main : 'DevilHunter', asc: +sv.asc || 0, esther: { ...(sv.esther || {}) } };
  }
  return profile;
}
function saveProfile() { try { localStorage.setItem('rift_opts', JSON.stringify(profile)); } catch {} }

// ───────── 캐릭터 선택 (로스트아크 모바일 캐릭터 선택창 방식) ─────────
function charSelect() {
  mode = 'select'; view.active = false; hud.innerHTML = ''; closeModal(); closeUnitInfo();
  const P = getProfile();
  view.showLobby(CLASS_KEYS.map(k => ({ key: k, kind: UNITS[k].kind })), P.main, IMG.selectBg);
  screen.innerHTML = '';
  const el = h(`<div class="csel">
    <div class="cs-top"><b>캐릭터 선택</b><span>원정대 캐릭터 ${CLASS_KEYS.length}</span></div>
    <div class="cs-list" id="cl"></div>
    <div class="cs-bot">
      <div class="cs-name" id="cn"></div>
      <div class="cs-il"><span>아이템 레벨</span><button data-d="-10">−10</button><button data-d="-1">−1</button><input id="il" type="number" min="1600" max="1800"><button data-d="1">+1</button><button data-d="10">+10</button></div>
      <label class="cs-es"><input type="checkbox" id="es"> <span>에스더 무기 보유</span></label>
      <div class="cs-tier" id="ct"></div>
      <button class="btn big cs-go" id="go">모험 시작</button>
    </div>
  </div>`);
  screen.appendChild(el);
  const render = () => {
    const k = P.main, U = UNITS[k], il = P.roster[k], t = tierFor(k, il);
    $('#cl', el).innerHTML = CLASS_KEYS.map(c => `<button class="cs-c${c === k ? ' on' : ''}${P.roster[c] < 1700 ? ' low' : ''}" data-k="${c}"><img src="${UNITS[c].img}"><span><b>${UNITS[c].name}</b><small>${P.roster[c]}${P.esther[c] ? ' · <em class="es">에스더</em>' : ''}</small></span></button>`).join('');
    $('#cn', el).innerHTML = `<small>${U.role}</small><b>${U.name}</b>`;
    $('#il', el).value = il; $('#es', el).checked = !!P.esther[k];
    $('#ct', el).innerHTML = U.tiers.map((x, i) => `<i class="${i < t ? 'ok' : ''}" title="${x.text}">${x.ilvl}</i>`).join('') + (t === 0 ? '<em>1700 미만 · 차원의 균열 입장 불가</em>' : `<em>${t >= 4 ? '모든 기능 해금' : `이후 단계는 균열 Lv.${LEVEL_TIER[t]}에서 해금`}</em>`);
    $('#cl', el).querySelectorAll('.cs-c').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); select(b.dataset.k); });
  };
  const select = (k) => { if (!k || k === P.main) return; P.main = k; view.setLobbySel(k); saveProfile(); render(); };
  const setIl = (v) => { P.roster[P.main] = Math.max(1600, Math.min(1800, Math.round(v) || 1600)); saveProfile(); render(); };
  el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => setIl(P.roster[P.main] + +b.dataset.d));
  $('#il', el).onchange = () => setIl(+$('#il', el).value);
  $('#es', el).onchange = () => { P.esther[P.main] = $('#es', el).checked; saveProfile(); render(); };
  el.addEventListener('pointerdown', (ev) => { if (ev.target === el) select(view.lobbyPick(ev.clientX, ev.clientY)); });
  $('#go', el).onclick = () => { saveProfile(); fieldScreen(); };
  render();
}

// ───────── 필드 (캐릭터 진입 후 화면 · 메뉴에서 낙원) ─────────
function fieldScreen() {
  mode = 'field'; view.active = false; hud.innerHTML = ''; closeModal();
  const P = getProfile(), U = UNITS[P.main];
  view.showField(U.kind, U.name);
  screen.innerHTML = '';
  const side = (list) => list.map(([n, ic, act]) => `<button class="fd-i${act ? '' : ' off'}" data-a="${act || ''}"><i>${ic}</i><span>${n}</span></button>`).join('');
  const LEFT = [['원정대', '◈'], ['캐릭터', '♜', 'char'], ['성장', '❦'], ['모험의 서', '✎'], ['수집', '❖']];
  const RIGHT = [['던전', '⛩'], ['전장', '⚔'], ['상점', '⛁'], ['거래소', '⚖'], ['커뮤니티', '✉']];
  const GRID = [['낙원', '✦', 'par'], ['각인', '◇'], ['카오스 던전', '✵'], ['장신구 성장', '❂'], ['가디언 토벌', '⚔'], ['길드', '⛨'], ['업적', '♛'], ['에포나 의뢰', '✧'],
    ['펫', '❀'], ['카오스 브레이크', '✊'], ['장비 재련', '⚒'], ['호감도', '♡'], ['탈것', '♞'], ['코스튬', '✂'], ['전투 스킬', '✺'], ['마이룸', '⌂']];
  const el = h(`<div class="field">
    <div class="fd-top"><button class="fd-back" id="bk">‹ 캐릭터 선택</button><div class="fd-me"><b>${U.name}</b><small>아이템 레벨 ${P.roster[P.main]}</small></div></div>
    <div class="fd-col l">${side(LEFT)}</div><div class="fd-col r">${side(RIGHT)}</div>
    <div class="fd-grid" id="fg"><div class="fg-h">메뉴</div><div class="fg-b">${side(GRID)}</div></div>
    <div class="fd-bot"><button class="fd-menu" id="mn"><i>☰</i><b>메뉴</b><em>낙원</em></button></div>
  </div>`);
  screen.appendChild(el);
  const grid = $('#fg', el);
  const act = (a, name) => {
    if (a === 'par') { paradise(); return; }
    if (a === 'char') { charSelect(); return; }
    toast(`${name} · 준비 중`, '#9aa3b5');
  };
  el.querySelectorAll('.fd-i').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); act(b.dataset.a, b.querySelector('span').textContent); });
  $('#mn', el).onclick = (ev) => { ev.stopPropagation(); grid.classList.toggle('on'); $('#mn', el).classList.toggle('open', grid.classList.contains('on')); };
  $('#bk', el).onclick = (ev) => { ev.stopPropagation(); charSelect(); };
  el.addEventListener('pointerdown', (ev) => {
    if (ev.target !== el) return;
    if (grid.classList.contains('on')) grid.classList.remove('on');
  });
}
function mainMenu() { charSelect(); } // 하위 호환
function paradise() {
  mode = 'paradise'; view.active = false; hud.innerHTML = ''; closeModal(); view.hideLobby();
  const ms = M.loadMeta();
  screen.innerHTML = '';
  const el = h(`<div class="menu par" style="background-image:url('${IMG.selectBg}')">
    <div class="phead"><button class="btn sm ghost" id="back">← 필드</button><b>낙원</b><span>낙원력 <em>${M.paradisePower(ms).toLocaleString()}</em></span></div>
    <button class="pcard rift" id="p_rift"><b>차원의 균열</b><span>로스트아크 클래스·NPC로 9층을 돌파하는 오토배틀러 로그라이크 (현재 1층)</span></button>
    <button class="pcard relic" id="p_relic"><b>낙원의 유산</b><span>유물 복원 · 공명 — 균열의 NPC 해금과 보너스</span>
      <div class="picons">${M.RELIC_KEYS.map(k => `<i>${relicIcon(k, ms.grades[k])}<small>${ms.relics[k]}</small></i>`).join('')}</div></button>
    <div class="pnote">복원석 💠 ${ms.stones} · 균열 전투 승리마다 복원석을 얻습니다 (일반 1 · 정예 2 · 보스 3)</div>
  </div>`);
  screen.appendChild(el);
  $('#back', el).onclick = fieldScreen;
  $('#p_rift', el).onclick = riftSetup;
  $('#p_relic', el).onclick = () => relicUI('restore', 'censer');
}
// 낙원의 유산: 복원 / 공명
function relicUI(tab = 'restore', sel = 'censer', flash = '') {
  mode = 'relic';
  const ms = M.loadMeta(), st = ms.relics[sel], D = M.RELIC_DEF[sel];
  const odds = M.restoreOdds(st), cost = M.restoreCost(st);
  screen.innerHTML = '';
  const icons = M.RELIC_KEYS.map(k => `<button class="ric${k === sel && tab === 'restore' ? ' on' : ''}" data-k="${k}" style="--c:${M.RELIC_DEF[k].color}">${relicIcon(k, ms.grades[k])}<b>${ms.relics[k]}단계</b><small>${M.RELIC_DEF[k].name} · <em style="color:${M.GRADE_COL[ms.grades[k]]}">${M.GRADES[ms.grades[k]]}</em></small></button>`).join('');
  let body = '';
  if (tab === 'restore') {
    body = `<div class="rodds">${st >= 18 ? '<b>최대 단계</b>' : `복원 시도 시 다음 확률로 적용됩니다<div><span>${st}단계 —<br><em>${Math.round((1 - odds) * 100)}%</em></span><span class="up">${st + 1}단계 ▲<br><em>${Math.round(odds * 100)}%</em></span></div>`}</div>
      <div class="rstone">복원석 💠 <b>${ms.stones}</b> · 이번 시도 ${cost}개 소모</div>
      <div class="rrow"><button class="btn big" id="try" ${st >= 18 || ms.stones < cost ? 'disabled' : ''}>복원 시도</button></div>
      ${flash ? `<div class="rflash">${flash}</div>` : ''}
      <div class="rtip"><div class="rth">${relicIcon(sel, ms.grades[sel], 'sm')} ${D.name} <small>${D.theme} 유물 · 효과는 파티 전체에 적용</small></div>
        <div class="rsec">등급 <b style="color:${M.GRADE_COL[ms.grades[sel]]}">${M.GRADES[ms.grades[sel]]}</b> · 단계 보너스 ×${M.GRADE_MUL[ms.grades[sel]]}</div><div class="rst">균열 보상으로 더 높은 등급을 얻으면 등급업 (${M.GRADES.join(' → ')}). 같거나 낮은 등급은 복원석으로 환산</div>
        <div class="rsec">차원의 균열 복원 효과</div>
        ${Array.from({ length: 18 }, (_, i) => i + 1).map(n => `<div class="rst${n <= st ? ' got' : ''}${n === st + 1 ? ' next' : ''}"><b>${n}단계</b> ${M.stageText(sel, n)}</div>`).join('')}
        <div class="rsec">공명 효과 (9단계부터)</div><div class="rst${st >= 9 ? ' got' : ''}"><b>${D.res.name}</b> ${D.res.desc}</div>
      </div>`;
  } else {
    body = `<div class="rres">${M.RELIC_KEYS.map(k => { const R = M.RELIC_DEF[k], on = ms.relics[k] >= 9;
      return `<div class="rri${on ? ' on' : ''}">${relicIcon(k, ms.grades[k])}<div><b>${R.name} · ${R.res.name}</b> <small>${on ? '공명 중' : `${ms.relics[k]}/9단계`}</small><p>${R.res.desc}</p></div></div>`; }).join('')}
      <div class="pnote">9단계 이상인 유물의 공명 효과가 차원의 균열 전투에 모두 적용됩니다.</div></div>`;
  }
  const el = h(`<div class="menu relicui">
    <div class="phead"><button class="btn sm ghost" id="back">← 낙원</button><b>낙원의 유산</b><span>낙원력 <em>${M.paradisePower(ms).toLocaleString()}</em></span></div>
    <div class="rgrid">${icons}</div>
    <div class="rtabs"><button class="btn${tab === 'restore' ? '' : ' ghost'}" id="t_res">복원</button><button class="btn${tab === 'reso' ? '' : ' ghost'}" id="t_rso">공명</button></div>
    <div class="rbody">${body}</div>
    <div class="rdev"><button class="btn xs ghost" id="d_st">개발: 복원석 +50</button><button class="btn xs ghost" id="d_max">개발: 전부 18단계</button><button class="btn xs ghost" id="d_rst">시즌 초기화</button></div>
  </div>`);
  screen.appendChild(el);
  $('#back', el).onclick = paradise;
  el.querySelectorAll('.ric').forEach(b => b.onclick = () => relicUI('restore', b.dataset.k));
  $('#t_res', el).onclick = () => relicUI('restore', sel);
  $('#t_rso', el).onclick = () => relicUI('reso', sel);
  const tr = $('#try', el); if (tr) tr.onclick = () => {
    const r = M.tryRestore(ms, sel);
    relicUI('restore', sel, !r.ok ? r.msg : r.up ? `<b class="ok">복원 성공!</b> ${D.name} ${r.st}단계 · ${M.stageText(sel, r.st)}` : `<b class="no">복원 실패</b> · ${r.st}단계 유지`);
  };
  $('#d_st', el).onclick = () => { ms.stones += 50; M.saveMeta(ms); relicUI(tab, sel); };
  $('#d_max', el).onclick = () => { for (const k of M.RELIC_KEYS) ms.relics[k] = 18; M.saveMeta(ms); relicUI(tab, sel); };
  $('#d_rst', el).onclick = () => { const d = M.DEFAULT_META(); for (const k of M.RELIC_KEYS) { ms.relics[k] = 0; ms.grades[k] = 0; } ms.stones = d.stones; ms.season++; M.saveMeta(ms); toast('낙원 시즌 초기화 · 모든 유물 0단계', '#ff9a8a'); relicUI(tab, sel); };
}

// ───────── 타이틀 ─────────
// 차원의 균열 입장: 캐릭터 선택창에서 고른 캐릭터로 입장 (여기서는 심화 단계만 고른다)
function riftSetup() {
  mode = 'title'; view.active = false; hud.innerHTML = ''; view.hideLobby();
  const P = getProfile(), sel = P.main, U = UNITS[sel], roster = P.roster;
  const t = tierFor(sel, roster[sel]);
  screen.innerHTML = '';
  const mates = CLASS_KEYS.filter(k => k !== sel && roster[k] >= 1700).map(k => `${UNITS[k].name} ${roster[k]}`);
  const mb = M.metaBonus(M.loadMeta());
  const npcTxt = NPC_KEYS.map(k => UNITS[k].name);
  const s = h(`<div class="title" style="background-image:url('${IMG.selectBg}')">
    <button class="btn sm ghost backbtn" id="back">← 낙원</button>
    <div class="tt">차원의 균열</div><div class="tsub">입장 캐릭터 확인</div>
    <div class="rs-me"><img src="${U.full}" alt=""><div><small>${U.role}</small><b>${U.name}</b><em>아이템 레벨 ${roster[sel]}</em><button class="btn xs ghost" id="chg">캐릭터 변경</button></div></div>
    <div class="panel">
      <div class="tiers"><div class="th">${U.name} 해금 단계 <small>(원정대 아이템 레벨 · 균열 레벨 중 높은 쪽)</small></div>${U.tiers.map((x, i) => `<div class="${i < t ? 'ok' : ''}"><b>${x.ilvl}</b> ${x.text}${i >= t && t > 0 ? ` <small>· 균열 Lv.${LEVEL_TIER[i]}에서 해금</small>` : ''}</div>`).join('')}${t === 0 ? '<div class="warn">아이템 레벨 1700 미만은 입장할 수 없습니다 (캐릭터 선택창에서 조정)</div>' : ''}</div>
      ${P.esther[sel] ? '<div class="note" style="color:#ffb0e0">에스더 무기 보유</div>' : ''}
      <div class="note">현재 범위: <b>1~3층</b></div>
    </div>
    <button class="btn big" id="go" ${t === 0 ? 'disabled' : ''}>균열 입장</button>
    <div class="codex" id="cdx"></div>
  </div>`);
  screen.appendChild(s);
  renderCodex($('#cdx', s));
  $('#back').onclick = paradise;
  $('#chg').onclick = charSelect;
  $('#go').onclick = () => {
    saveProfile();
    run = G.newRun({ main: sel, roster: { ...roster }, asc: 0, meta: M.metaBonus(M.loadMeta()), esther: !!P.esther[sel] });
    codexMark('units', sel);
    showMap(); // 시작 유물 선택 없이 바로 지도로
  };
}
function title() { riftSetup(); } // 하위 호환
// 도감: 동료·클래스는 카드(누르면 팝업), 장신구는 아이콘 목록. 만나지 못한 것은 ?
function renderCodex(el) {
  const C = loadCodex(), keys = [...CLASS_KEYS, ...NPC_KEYS], accs = A.allAccs();
  const nU = keys.filter(k => C.units[k]).length, nA = accs.filter(a => C.accs[A.accId(a)]).length;
  el.innerHTML = `<div class="cx-h"><b>도감</b><span>동료·클래스 ${nU}/${keys.length} · 장신구 ${nA}/${accs.length}</span>
      <button class="btn xs ghost" id="cx_all">도감 완성</button><button class="btn xs ghost" id="cx_rst">도감 초기화</button></div>
    <div class="cx-sec">동료 · 클래스</div>
    <div class="cx-grid">${keys.map(k => C.units[k] ? `<button class="cx-u" data-k="${k}"><img src="${UNITS[k].img}"><span>${UNITS[k].name}</span></button>` : `<button class="cx-u q" disabled><i>?</i><span>???</span></button>`).join('')}</div>
    <div class="cx-sec">장신구</div>
    <div class="cx-acc">${accs.map((a, i) => C.accs[A.accId(a)] ? `<span class="ricon ${A.ACC_GRADE_BG[a.grade]}" data-a="${i}" title="${A.ACC_GRADES[a.grade]} ${A.accName(a)}"><img src="${A.accImg(a)}"></span>` : `<span class="ricon q" title="???"><i>?</i></span>`).join('')}</div>`;
  el.querySelectorAll('.cx-u[data-k]').forEach(b => b.onclick = () => codexCard(b.dataset.k));
  el.querySelectorAll('.cx-acc [data-a]').forEach(b => b.onclick = () => accCard(accs[+b.dataset.a]));
  $('#cx_all', el).onclick = () => { const c = loadCodex(); for (const k of keys) c.units[k] = 1; for (const a of accs) c.accs[A.accId(a)] = 1; saveCodex(c); renderCodex(el); toast('도감 완성 (시뮬레이터)', '#7ee08a'); };
  $('#cx_rst', el).onclick = () => { saveCodex({ units: {}, accs: {} }); renderCodex(el); toast('도감 초기화', '#ff9a8a'); };
}
// 장신구 효과 보기 (도감에서 클릭)
function accCard(a) {
  const lines = a.slot === 'bracelet'
    ? `무작위 옵션 ${a.grade === 2 ? '1~3' : '1~2'}개 (각 하·중·상)<br><small>${Object.values(A.BRACELET_OPTS).map(o => o.name).join(' · ')}</small>`
    : A.accLines(a).map(l => l.text).join('<br>');
  const m = modal(`<div class="accpop"><div class="mt" style="color:${A.ACC_GRADE_COL[a.grade]}">${A.ACC_GRADES[a.grade]} · ${A.accName(a)}</div>
    <span class="ricon ${A.ACC_GRADE_BG[a.grade]} big"><img src="${A.accImg(a)}"></span>
    <small>${A.ACC_SLOTS[a.slot]}${a.slot !== 'bracelet' ? ` · ${A.ACC_KEYWORD[a.key]}` : ''}</small><p>${lines}</p>
    <div class="mrow"><button class="btn" id="ok">닫기</button></div></div>`);
  $('#ok', m).onclick = closeModal;
  m.addEventListener('pointerdown', (e) => { if (e.target === m) closeModal(); });
}
function codexCard(k) {
  const U = UNITS[k], D = G.unitDef(k), mag = (U.dmg || '물리') === '마법';
  const rar = U.cls ? '원정대 클래스' : '★'.repeat(D.rarity || 3) + ` <small>희귀도 ${D.rarity || 3}</small>`;
  const col = U.cls ? '#e9b84a' : RARITY_COL[D.rarity || 3];
  const B = D.base, stats = [['체력', B.hp.toLocaleString()], [mag ? '마법 공격력' : '공격력', B.atk], ['마나', U.kind === 'dh' ? '없음 (스탠스 순환)' : D.mana], ['사거리', `${D.rangeCells ?? 4}칸`]];
  const skills = [];
  if (D.basic?.name) skills.push(['기본 공격', D.basic.name]);
  if (D.skill?.name) skills.push(['스킬', D.skill.name]);
  const m = modal(`<div class="cx-card" style="--c:${col}">
    <div class="cx-img"><img src="${U.full || U.img}" alt=""></div>
    <div class="cx-body"><div class="cx-name">${U.name}</div>
      <div class="cx-tags"><span class="cx-rar">${rar}</span><span class="dm ${mag ? 'mag' : 'phy'}">${mag ? '마법' : '물리'}</span><span>${U.role}</span></div>
      <div class="cx-stats">${stats.map(([a, b]) => `<span>${a}<b>${b}</b></span>`).join('')}</div>
      <div class="cx-sk">${skills.map(([a, b]) => `<div><em>${a}</em> ${b}</div>`).join('')}<p>${unitDesc(k)}</p>
        ${U.tiers ? `<div class="cx-tier">${U.tiers.map(x => `<div><b>${x.ilvl}</b> ${x.text}</div>`).join('')}</div>` : ''}</div>
      <button class="btn" id="cxc">닫기</button></div></div>`, 'cxm');
  $('#cxc', m).onclick = closeModal;
  m.addEventListener('pointerdown', (e) => { if (e.target === m) closeModal(); });
}

// ───────── 지도 ─────────
function showMap() {
  mode = 'map'; view.active = false; hud.innerHTML = '';
  const m = run.map, f = run.floor;
  screen.innerHTML = '';
  const el = h(`<div class="mapscr">
    <div class="mhead"><div class="fl">차원의 균열 ${f}층 · ${FLOOR_ZONE(f)}</div></div>
    <div class="grid" id="grid"></div>
    <div class="msg" id="mmsg">방향키 또는 인접한 칸을 눌러 이동하세요</div>
    ${m.grid[m.pos.r][m.pos.c]?.type === 'shop' ? '<button class="btn shopin" id="shopin">🛒 상점 들어가기 <kbd>E</kbd></button>' : ''}
    <div class="mfoot">
      <button class="btn big wtbtn" id="wt">⚔ 대기 단계로 돌아가기 · 장비 정비</button>
      <div class="mbtns"><button class="btn sm" id="info">균열 정보</button><button class="btn sm ghost" id="dev">개발자</button></div>
    </div></div>`);
  screen.appendChild(el);
  const grid = $('#grid', el);
  G.updateReveal(run);
  for (let r = 0; r < G.MAP_N; r++) for (let c = 0; c < G.MAP_N; c++) {
    const cell = m.grid[r][c];
    const d = document.createElement('div'); d.className = 'gc';
    d.dataset.rc = r + ',' + c;
    if (cell) {
      const rev = G.isRevealed(run, r, c) || run.devReveal;
      const here = m.pos.r === r && m.pos.c === c;
      if (rev) {
        d.classList.add('room');
        if (cell.visited && cell.type === 'shop') { d.classList.add('vis', 'shopv'); d.style.background = ROOM_INFO.shop.color; d.textContent = here ? '' : ROOM_NAME('shop'); } // 상점은 방문 후에도 그대로 (재방문 가능)
        else if (cell.visited) { d.classList.add('vis'); d.textContent = here ? '' : '✓'; }
        else { d.style.background = cell.type === 'boss' && f >= 2 ? '#8a2be2' : ROOM_INFO[cell.type].color; d.textContent = ROOM_NAME(cell.type); if (cell.type === 'boss' && f >= 2) d.classList.add('boss2'); } // 2층 보스방은 보라색
      } else if (G.isFrontier(run, r, c)) { d.classList.add('fog'); d.textContent = '?'; }
      if (here) d.classList.add('here'); // 캐릭터는 3D 모델로 칸 위에 서 있다
      if (cell.junction && rev) d.classList.add('jn');
      if (G.canMove(m, r, c)) { d.classList.add('mv'); d.onclick = () => moveTo(r, c); }
    }
    grid.appendChild(d);
  }
  $('#info', el).onclick = infoPanel;
  if ($('#shopin', el)) $('#shopin', el).onclick = () => { if (!mapMoving) shopRoom(); };
  $('#dev', el).onclick = devPanel;
  $('#wt', el).onclick = waitPhase;
  mapMoving = false;
  view.showMapChar(UNITS[run.main].kind);
  requestAnimationFrame(placeMapChar);
  flushUnlocks();
}
// 지도 칸(r, c)의 발 위치 (캔버스 기준 픽셀)
function tileFoot(r, c) {
  const d = screen.querySelector(`.gc[data-rc="${r},${c}"]`); if (!d) return null;
  const a = d.getBoundingClientRect(), b = $('#gl').getBoundingClientRect();
  return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height * 0.8, size: a.width };
}
function placeMapChar() { if (mode !== 'map' || !run?.map) return; const p = tileFoot(run.map.pos.r, run.map.pos.c); if (p) view.setMapCharPos(p.x, p.y, p.size); }
window.addEventListener('resize', () => { if (mode === 'map') placeMapChar(); });
let mapMoving = false;
// 캐릭터가 다음 칸까지 걸어간 뒤 방에 들어간다
async function walkTo(r, c) {
  const p = tileFoot(r, c); mapMoving = true;
  if (p) await view.moveMapChar(p.x, p.y);
  mapMoving = false;
}

document.addEventListener('keydown', (e) => {
  if (mode !== 'map' || modalRoot.children.length) return;
  if ((e.key === 'e' || e.key === 'E' || e.key === 'ㄷ') && run.map.grid[run.map.pos.r][run.map.pos.c]?.type === 'shop' && !mapMoving) { e.preventDefault(); return shopRoom(); } // 상점 재방문 키
  const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
  if (!d) return;
  e.preventDefault();
  const r = run.map.pos.r + d[0], c = run.map.pos.c + d[1];
  if (G.canMove(run.map, r, c)) moveTo(r, c);
});

async function moveTo(r, c) {
  if (mapMoving) return;
  const cell = run.map.grid[r][c];
  if (cell.type === 'boss' && !cell.visited) {
    const m = modal(`<div class="mt">이 층의 보스에게 도전하시겠습니까?</div><div class="ms">보스를 처치하면 다음 층으로 갈 수 있습니다.<br>가지 않은 방은 사라집니다.</div>
      <div class="mrow"><button class="btn" id="y">예</button><button class="btn ghost" id="n">아니오</button></div>`);
    $('#y', m).onclick = async () => { closeModal(); await walkTo(r, c); run.map.pos = { r, c }; enterRoom(cell); };
    $('#n', m).onclick = closeModal;
    return;
  }
  await walkTo(r, c);
  run.map.pos = { r, c };
  if (cell.visited) { showMap(); return; }
  enterRoom(cell);
}

async function enterRoom(cell) {
  cell.visited = true;
  switch (cell.type) {
    case 'battle': case 'elite': case 'boss': return startBattle(cell.type);
    case 'rift': return riftRoom();
    case 'shop': return shopRoom();
    case 'event': return eventRoom();
    case 'recruit': return recruitRoom();
    default: showMap();
  }
}

// ───────── 비전투 방 ─────────
function recruitRoom() {
  // 동료 영입: 후보 3명 중 1명 선택. NPC는 희귀도별 등장 확률로 먼저 뽑고, 남은 자리는 원정대의 다른 클래스로 채운다
  const pool = G.recruitCandidates(run, 3 + (run.meta?.recruitPlus || 0));
  if (!pool.length || run.units.length >= G.MAX_PARTY) {
    choose({ title: '동료 영입', sub: run.units.length >= G.MAX_PARTY ? '파티가 가득 찼습니다. 대체 보상을 받습니다.' : '영입할 수 있는 동료 후보가 없습니다. 대체 보상을 받습니다.', skip: null,
      options: [
        { title: '지혜의 서', sub: '대체 보상', desc: '경험치 +50 (파티 인원으로 나눔)', color: '#2e7d4f', badge: '영입', apply: () => { const up = G.gainExp(run, 50); if (up) toast(`레벨 업! Lv.${run.unit.level}`, '#7ee08a'); } },
        { title: '동료의 응원', sub: '대체 보상', desc: '파티 전원 체력 30% 회복', color: '#2e7d4f', badge: '영입', apply: () => G.healPct(run, 0.3) },
      ], onDone: showMap });
    return;
  }
  const desc = unitDesc;
  recruitUI(pool, desc);
}
// 동료 영입 창: 세로로 긴 카드 3장 (초상화 · 이름 · 배치(전열/후열) · 직업군 · 물리/마법), 누르면 아래에 상세, [선택]으로 영입
const RARITY_COL = ['', '', '#58c27d', '#4f8fe8', '#a35fe8', '#f0a23a']; // 희귀도 2 초록 · 3 파랑 · 4 보라 · 5 주황
function recruitUI(pool, desc) {
  let sel = -1; for (const k of pool) codexMark('units', k);
  const info = (k) => {
    const U = UNITS[k], D = G.unitDef(k), role = U.role.split(' · ')[0];
    const front = D.rangeCells != null && D.rangeCells <= 1;
    const r = D.rarity || 3; // 희귀도 표시 (2026-10-31 3차): NPC는 ★ 개수 + 색, 클래스는 원정대 클래스
    return { U, role, dmg: U.dmg || '물리', tier: U.cls ? `원정대 · ${run.roster[k]}` : U.esther ? '에스더' : 'NPC', rar: U.cls ? '' : `<span class="rc-rar" style="color:${RARITY_COL[r]}">${'★'.repeat(r)}<small>희귀도 ${r}</small></span>`, col: U.cls ? '#e9b84a' : RARITY_COL[r] };
  };
  const render = () => {
    const m = modal(`<div class="rc">
      <div class="rc-t">동료 영입</div><div class="rc-s">영입할 동료를 선택하세요 · 파티 ${run.units.length}명</div>
      <div class="rc-cards">${pool.map((k, i) => { const I = info(k); return `<button class="rc-card${i === sel ? ' on' : ''}" data-i="${i}" style="--c:${I.col}">
        <div class="rc-por"><img src="${I.U.img}" alt=""><span class="rc-type">${I.U.cls ? '클래스' : 'NPC'}</span></div>
        <b class="rc-name">${I.U.name}</b>${I.rar}
        <div class="rc-tags"><span>${I.role}</span><span class="dm ${I.dmg === '마법' ? 'mag' : 'phy'}">${I.dmg}</span></div>
        <small class="rc-tier">${I.tier}</small></button>`; }).join('')}</div>
      <div class="rc-desc">${sel >= 0 ? `<b>${UNITS[pool[sel]].name}</b><br>${desc(pool[sel])}` : '카드를 누르면 상세 정보가 표시됩니다.'}</div>
      <div class="rc-btns"><button class="btn big rc-go" id="go" ${sel < 0 ? 'disabled' : ''}>선택</button><button class="btn ghost" id="skip">영입하지 않음</button></div></div>`, 'wide rcm');
    m.querySelectorAll('.rc-card').forEach(b => b.onclick = () => { sel = +b.dataset.i; closeModal(); render(); });
    $('#go', m).onclick = () => { const k = pool[sel]; if (!k) return; closeModal(); G.addUnit(run, k); toast(`${UNITS[k].name}이(가) 동료가 되었습니다`, '#7ee08a'); showMap(); };
    $('#skip', m).onclick = () => { closeModal(); showMap(); };
  };
  render();
}

function riftRoom() {
  const m = modal(`<div class="mt">균열의 틈</div><div class="ms">불안정한 균열이 열려 있습니다.<br><b>수락</b>하면 적이 1명 늘고 생명력·공격력이 30% 오르지만, 승리 시 <b>유물 선택</b>이 확정됩니다.<br>거절하면 일반 전투가 시작됩니다.</div>
    <div class="mrow"><button class="btn" id="y">수락</button><button class="btn ghost" id="n">거절</button></div>`);
  $('#y', m).onclick = () => { closeModal(); startBattle('rift'); };
  $('#n', m).onclick = () => { closeModal(); startBattle('battle'); };
}

// ───────── 상점: 떠돌이 상인 · 아나벨이 서 있는 장면. 상인을 누르면 거래창 ─────────
let shopState = null;
const SHOP_NPC = {
  merchant: { name: '떠돌이 상인', model: 'Merchant', h: 2.3, img: 'img/T_Shop_Merchant.png', col: 2, desc: '회복 물약 · 장비 강화 재료 · 장비' },
  anabel: { name: '아나벨', model: 'Anabel', h: 2.2, img: 'img/T_Shop_Anabel.png', col: 4, desc: '클래스 · NPC 동료 영입' },
};
function shopStock(kind) {
  if (kind === 'merchant') {
    const P = G.SHOP_PRICE;
    const items = [{ k: 'potion', name: '회복 물약', desc: '유닛 1명 체력 50% 회복 · 여러 번 구매 가능', img: 'img/eq/it_potion.png', p: G.price(run, P.potion), repeat: true }];
    for (const t of G.SHOP_HONE_TIERS(run.floor)) items.push({ k: 'hone', t, name: `${t}티어 강화 재료`, desc: `${t}티어 장비를 같은 종류의 ${t + 1}티어 장비로 강화`, img: `img/eq/it_hone${t === 2 ? '2' : ''}.png`, p: G.price(run, P.hone[t]) });
    for (let i = 0; i < 2; i++) { const it = G.makeEquip(run, { tier: G.shopEquipTier(run) }); items.push({ k: 'equip', it, name: `${it.tier}티어 ${G.equipName(it)}`, desc: G.equipText(it), img: EQUIP_IMG(it.kind, it.tier), color: TIER_COL[it.tier], p: G.price(run, P.equip[it.tier]) }); }
    return items;
  }
  return G.recruitCandidates(run, 2).map(k => (codexMark('units', k), { k: 'mate', key: k, name: UNITS[k].name, desc: (UNITS[k].cls ? `원정대 클래스 · 아이템 레벨 ${run.roster[k]} · ` : `NPC · ${'★'.repeat(G.unitDef(k).rarity || 3)} 희귀도 ${G.unitDef(k).rarity || 3} · `) + UNITS[k].role + ' · ' + (UNITS[k].dmg || '물리'), img: UNITS[k].img, p: G.recruitPrice(run, k) }));
}
function shopRoom() {
  // 상점은 다시 들를 수 있다: 칸마다 상품을 기억해 두고 재방문하면 그대로 보여준다
  const cell = run.map.grid[run.map.pos.r][run.map.pos.c];
  if (!cell.shop) cell.shop = { merchant: shopStock('merchant'), anabel: shopStock('anabel') };
  shopState = cell.shop;
  shopScene();
}
function shopScene() {
  mode = 'shop'; closeUnitInfo(); screen.innerHTML = ''; view.clear(); view.active = true; view.speed = 1; view.setTheme(stageTheme('shop'));
  allies = G.makeAllies(run); ally = null;
  battle = new Battle(allies, [], G.battleCfg(run, 'battle'));
  for (const u of allies) view.addUnit(u);
  let sid = 900;
  for (const [k, N] of Object.entries(SHOP_NPC)) {
    const p = cellToPos('enemy', N.col, 1);
    view.addUnit({ id: sid++, side: 'shop', shopKey: k, name: N.name, model: N.model, h: N.h, x: p.x, z: p.z, face: -Math.PI / 2, rad: 0.6, hp: 1, maxHp: 1, alive: true, def: { idle: 'idle_normal_1', run: 'idle_normal_1' } });
  }
  deploying = true; view.showBoard(true); view.highlightCells(false); view.showEnemyCells(false); view.path.visible = false;
  hud.innerHTML = '';
  hud.appendChild(h(`<div class="bh">
    <div class="btop"><div class="bt">${run.floor}층 · 상점</div><div class="bclock">${coinIco} ${run.coins}</div></div>
    <div class="bbot" id="bbot"><div class="dtip"><b>상인을 눌러</b> 거래하세요<br><small>아래로 스크롤하면 장비 창 · 산 장비는 바로 장착할 수 있습니다</small></div>
      <button class="btn big" id="tomap">지도 보기</button></div></div>`));
  $('#tomap').onclick = () => { shopState = null; leaveWait(); };
  mountSheet('post');
}
function tradeUI(kind) {
  const N = SHOP_NPC[kind], items = shopState[kind];
  const potCap = (run.asc >= 12 ? 2 : 4);
  const full = run.units.length >= G.MAX_PARTY;
  const m = modal(`<div class="trade">
    <div class="tr-h"><img src="${N.img}"><div><b>${N.name}</b><small>${N.desc}</small><em>보유 재화 ${coinIco} ${run.coins}</em></div></div>
    <div class="tr-list">${items.length ? items.map((it, i) => {
      const dis = it.sold || run.coins < it.p || (it.k === 'potion' && run.potions >= potCap) || (it.k === 'mate' && full);
      return `<button class="tr-i${it.sold ? ' sold' : ''}" data-i="${i}" ${dis ? 'disabled' : ''}><img src="${it.img}"><span><b style="color:${it.color || '#fff'}">${it.name}</b><small>${it.desc}</small></span><em>${it.sold ? '구매 완료' : coinIco + ' ' + it.p}</em></button>`; }).join('') : '<div class="tr-none">지금은 소개할 동료가 없어요</div>'}</div>
    ${kind === 'anabel' && full ? '<div class="tr-note">배치할 칸이 없습니다</div>' : ''}
    <div class="tr-note">${kind === 'merchant' ? '회복 물약 외 상품은 1회만 구매할 수 있습니다' : '동료는 1명씩 1회 영입'} · 새로고침하면 상품이 바뀌고 강화 재료도 다시 살 수 있습니다</div>
    <div class="mrow"><button class="btn ghost" id="rf" ${run.rerolls > 0 ? '' : 'disabled'}>새로고침 (리롤 ${run.rerolls})</button><button class="btn" id="out">닫기</button></div></div>`, 'wide');
  m.querySelectorAll('.tr-i').forEach(b => b.onclick = () => {
    const it = items[+b.dataset.i]; if (!it || it.sold || run.coins < it.p) return;
    if (it.k === 'potion') { if (!G.addConsumable(run, 'potions')) { toast('가방이 가득 찼습니다', '#ff9a8a'); return; } }
    else if (it.k === 'hone') { if (!G.addConsumable(run, it.t === 2 ? 'hones2' : 'hones')) { toast('가방이 가득 찼습니다', '#ff9a8a'); return; } }
    else if (it.k === 'equip') { if (!G.bagFree(run, {}) || G.bagUsed(run) + 1 > G.BAG_SLOTS) { toast('가방이 가득 찼습니다', '#ff9a8a'); return; } G.addToBag(run, it.it); }
    else if (it.k === 'mate') { if (run.units.length >= G.MAX_PARTY) return; G.addUnit(run, it.key); toast(`${it.name}이(가) 동료가 되었습니다`, '#7ee08a'); }
    run.coins -= it.p; if (!it.repeat) it.sold = true;
    closeModal();
    if (it.k === 'mate') { shopScene(); } else { renderSheet(); $('.bclock') && ($('.bclock').innerHTML = coinIco + ' ' + run.coins); }
    tradeUI(kind);
  });
  $('#rf', m).onclick = () => { if (run.rerolls <= 0) return; run.rerolls--; shopState[kind] = shopStock(kind); closeModal(); tradeUI(kind); };
  $('#out', m).onclick = () => { closeModal(); $('.bclock') && ($('.bclock').innerHTML = coinIco + ' ' + run.coins); };
}

// 이벤트: 조사하면 25% 확률로 실패(엘리트가 많은 매복 전투), 성공하면 20% 큰 보상(2티어 장비 / 경험치 대량) · 80% 적당한 보상(1티어 장비 / 경험치 소량)
const EVENT_FAIL = 0.25;
const EVENTS = [
  { t: '균열의 샘', d: '맑은 물이 고인 샘이 있습니다. 바닥에 무언가 반짝입니다.', a: '손을 넣어 본다' },
  { t: '버려진 무기고', d: '검은 산 전사들의 무기고가 무너져 있습니다.', a: '잔해를 뒤진다' },
  { t: '떠돌이 상인의 수레', d: '주인 없는 수레가 버려져 있습니다.', a: '짐을 뒤진다' },
  { t: '고대 서고', d: '균열에 삼켜진 서고의 잔해입니다.', a: '책장을 살핀다' },
  { t: '균열 파편', d: '불안정한 균열 파편이 떠다닙니다.', a: '파편을 붙잡는다' },
];
function eventRoom() {
  const ev = G.pick(EVENTS);
  choose({ title: `이벤트 · ${ev.t}`, sub: ev.d, skip: null,
    options: [
      { title: ev.a, desc: `성공: 장비 또는 경험치 (20% 큰 보상) · ${Math.round(EVENT_FAIL * 100)}% 실패 시 매복 전투`, color: '#2c6aa0', apply: async () => {
        if (Math.random() < EVENT_FAIL) { toast('함정이다! 적이 나타났습니다', '#ff6b6b'); startBattle('ambush'); return 'battle'; }
        const big = Math.random() < 0.2;
        await wait(done => choose({ title: big ? '큰 보상!' : '보상', sub: big ? '2티어 장비 또는 많은 경험치' : '1티어 장비 또는 약간의 경험치', skip: null,
          options: [equipOption(G.makeEquip(run, { tier: big ? 2 : 1 })), expOption(big ? 120 : 40)], onDone: done }));
      } },
      { title: '지나친다', desc: '아무 일도 일어나지 않는다', color: '#555', apply: () => {} },
    ], onDone: () => { if (mode !== 'battle') showMap(); } });
}
function infoPanel() {
  // 균열 정보 (2026-10-31 3차: 제단·균열 유물·각인 시스템 제거 → 낙원 유물과 파티 능력치만)
  const meta = M.loadMeta();
  const m = modal(`<div class="mt">균열 정보</div>
    <div class="sec">낙원 유물 <small>(런 밖 성장 · 등급 = 배경색)</small></div>
    <div class="rlist">${M.RELIC_KEYS.map(k => `<div class="rl">${relicIcon(k, meta.grades[k] || 0)}<b>${M.RELIC_DEF[k].name}</b><span>${meta.relics[k]}단계</span></div>`).join('')}</div>
    <div class="sec">파티 능력치</div>
    ${run.units.map(u => { const st = G.computeStats(run, u), U = UNITS[u.key], t = G.unitTier(run, u), D = G.unitDef(u.key);
      const extra = U.kind === 'dh' ? `<span>건 스탠스 순환 <b>${t >= 3 ? '해금' : '잠김'}</b></span><span>각성기 <b>${t >= 4 ? '해금' : '잠김'}</b></span>`
        : (U.kind === 'bk' ? `<span>수라결 <b>${t >= 3 ? '해금' : '잠김'}</b></span>` : '') + `<span>마나 <b>${D.mana} (공격당 +${D.manaPerHit})</b></span><span>사거리 <b>${D.rangeCells}칸</b></span>`;
      return `<div class="sec2">${U.name} <small>Lv.${u.level}</small></div><div class="stats">
      <span>최대 체력 <b>${st.maxHp.toLocaleString()}</b></span><span>${atkName(u.key)} <b>${Math.round(st.atk)}</b></span>
      <span>치명타 <b>${Math.round(st.crit * 100)}%</b></span><span>치명 피해 <b>${Math.round(st.critDmg * 100)}%</b></span>
      <span>피해 <b>+${Math.round((st.dmgMul - 1) * 100)}%</b></span><span>스킬 피해 <b>+${Math.round(st.skillDmg * 100)}%</b></span>
      <span>트라이포드 <b>${U.cls ? (t >= 2 ? st.tripod + '단' : '잠김') : '-'}</b></span>${extra}</div>`; }).join('')}
    <div class="mrow"><button class="btn" id="c">닫기</button></div>`, 'wide');
  $('#c', m).onclick = () => { closeModal(); if (mode === 'map') showMap(); };
}

function devPanel() {
  const m = modal(`<div class="mt">개발자 패널</div><div class="ms">기획 검증용 치트</div>
    <div class="devg">
      <button class="btn sm" data-a="coin">재화 +500</button><button class="btn sm" data-a="lv">레벨 +3</button>
      <button class="btn sm" data-a="heal">체력 회복</button><button class="btn sm" data-a="reveal">지도 공개</button>
      <button class="btn sm" data-a="acc">장신구 획득</button><button class="btn sm" data-a="eq">장비 획득</button>
      <button class="btn sm" data-a="recruit">동료 즉시 영입</button><button class="btn sm" data-a="floor">다음 층으로</button>
    </div>
    <div class="mrow"><button class="btn" id="c">닫기</button></div>`);
  m.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    const a = b.dataset.a; closeModal();
    if (a === 'coin') run.coins += 500;
    if (a === 'lv') G.gainExp(run, 300);
    if (a === 'heal') for (const u of run.units) u.hpPct = 1;
    if (a === 'recruit') { const k = G.recruitPool(run)[0]; if (k && run.units.length < G.MAX_PARTY) { G.addUnit(run, k); toast(`${UNITS[k].name} 영입`, '#7ee08a'); } }
    if (a === 'reveal') run.devReveal = true;
    if (a === 'acc') await accReward('개발자 · 장신구');
    if (a === 'eq') equipOption(G.makeEquip(run)).apply();
    if (a === 'floor') return nextFloor();
    showMap();
  });
  $('#c', m).onclick = () => { closeModal(); showMap(); };
}

// ───────── 전투 ─────────
let roomKind = 'battle', allies = [], ally = null, deploying = false, acc = 0, lastT = 0;

function startBattle(kind) {
  closeUnitInfo();
  roomKind = kind; mode = 'battle';
  if (kind === 'battle' || kind === 'rift') run.floorBattles++;
  screen.innerHTML = ''; view.clear(); view.active = true; view.speed = 1;
  view.setTheme(stageTheme(kind));
  allies = G.makeAllies(run);
  ally = allies.find(a => a.dh) || null; // 스탠스 표시용
  const here = run.map?.grid?.[run.map.pos.r]?.[run.map.pos.c];
  const enemies = G.enemiesFor(run, kind, { dist: here?.d ?? 2 });
  battle = new Battle(allies, enemies, G.battleCfg(run, kind));
  for (const u of battle.units) view.addUnit(u);
  deploying = true; view.showBoard(true); view.highlightCells(true);
  const isBoss = kind === 'boss';
  const bosses = enemies.filter(e => e.boss);
  hud.innerHTML = '';
  hud.appendChild(h(`<div class="bh">
    <div class="btop"><div class="bt">${run.floor}층 · ${ROOM_NAME(kind)}${enemies.stage ? ` · ${enemies.stage} 스테이지 (${run.floorBattles}번째 전투)` : ''}</div><div class="bclock" id="clock">배치</div></div>
    ${bosses.length ? `<div class="bossbar">${bosses.map(b => `<div class="bb" data-id="${b.id}"><div class="bbn">${b.name}</div><div class="bbh"><i></i></div><div class="bbg"></div></div>`).join('')}</div>` : ''}
    <div class="bbot" id="bbot">
      <div class="dtip">아군을 <b>길게 눌러</b> 들어 올린 뒤, 원하는 파란 칸에 놓으세요<br><small>아래로 스크롤하면 장비 창 · 장비를 필드의 영웅 위에 끌어 놓으면 장착</small></div>
      <button class="btn big" id="fight">전투 개시</button>
    </div></div>`));
  $('#fight').onclick = beginFight;
  updateStance();
  mountSheet('pre');
  mountMeter();
  if (bosses.length) view.banner((isBoss ? '' : '정예 보스 · ') + bosses.map(b => b.name).join(' · '), isBoss ? '#ff6b6b' : '#ffae6b');
}

// 전장 배경: 1층 일반 = 검은 산 / 1층 보스전 · 2층 = 숲속 폐허 / 2층 보스전 = 발탄 보스룸
// 1층 필드 = 검은 산 / 1·2층 보스전 = 궁궐 / 2층 필드 = 마수의 숲 / 3층 필드 = 무너진 성채 / 3층 보스전 = 발탄 보스룸
function stageTheme(kind) { const f = run?.floor || 1; if (kind === 'boss') return f >= 3 ? 'valtan' : 'palace'; return f >= 3 ? 'ruins' : f === 2 ? 'grass' : 'mountain'; }
function updateStance() {
  const el = $('#stance'); if (!el || !ally) return;
  const N = { pistol: '핸드건', shotgun: '샷건', rifle: '라이플' };
  if (!ally.canShotgun) { el.innerHTML = `<span class="on pistol">데빌헌터 핸드건 고정 (1750 미만)</span>`; return; }
  el.innerHTML = ['pistol', 'shotgun', 'rifle'].map(s => `<span class="${ally.stance === s ? 'on' : ''} ${s}">${N[s]} ${ally.stance === s ? `${ally.stanceUses || 0}/` : ''}${DH.cycle[s].count}</span>`).join('<i>›</i>');
}

// 배치: 데빌헌터를 길게 눌러 들어 올리고, 놓은 자리의 파란 칸으로 이동
const glHost = $('#gl');
const LIFT_MS = 280;
let press = null;
glHost.addEventListener('contextmenu', (e) => { e.preventDefault(); showUnitInfo(e.clientX, e.clientY); });

// 우클릭 정보: 남은 체력 · 레벨(아군만) · 공격력. 다시 우클릭하거나 클릭하면 닫힌다
let infoUnit = null, infoEl = null;
function showUnitInfo(cx, cy) {
  if ((mode !== 'battle' && mode !== 'wait') || !battle) return;
  const hit = view.pickUnit(cx, cy);
  closeUnitInfo();
  if (!hit) return;
  infoUnit = hit;
  infoEl = h('<div class="uinfo"></div>'); view.overlay.appendChild(infoEl);
  const loop = () => { if (!infoEl) return; drawUnitInfo(); requestAnimationFrame(loop); };
  loop();
}
function closeUnitInfo() { if (infoEl) infoEl.remove(); infoEl = null; infoUnit = null; }
// 스킬 설명 + 피해량 (현재 공격력 기준, 치명타 제외)
function skillInfo(u) {
  const base = u.atk * (u.dmgMul || 1);
  const n = (m) => Math.round(base * m).toLocaleString();
  const sk = (m) => Math.round(base * m * (1 + (u.skillDmg || 0)) * (u.skillMul || 1)).toLocaleString();
  const pc = (m) => Math.round(m * 100) + '%';
  const L = [];
  if (u.dh) {
    const P = DH.pistol.segs.map(s => s.hits[0][1]), G = DH.shotgun.hits.map(h => h[1]), R = DH.rifle.hits[0][1];
    L.push(['핸드건 · 잔혹한 추적자', `2발 ${P.map(pc).join(' / ')}`, P.map(n).join(' / ')]);
    if (u.canShotgun) {
      L.push(['샷건 · 샷건 연사', `전방 원뿔 4발 ${G.map(pc).join(' / ')}`, G.map(n).join(' / ')]);
      L.push(['라이플 · 원샷원킬', `1발 ${pc(R)}`, n(R)]);
      L.push(['스탠스 순환', '핸드건 5회 → 샷건 3회 → 라이플 2회', '']);
    }
    return L;
  }
  if (u.def) {
    const D = u.def, S = D.skill;
    const hits = D.basic.segs.reduce((a, s) => a + s.hits.length, 0);
    L.push(['기본 공격', `${hits > 1 ? `모션 1회에 ${hits}타, ` : ''}타격당 100%`, n(1)]);
    if (u.kind === 'sr') { L.push([`스킬 · ${S.name}`, `적이 가장 많은 3×3칸에 운석 ${pc(S.mult)}${G.unitTier(run, run.units.find(x => x.key === u.key) || run.unit) >= 2 ? ` (1730: 균열 Lv.${u.level} × 5% 포함)` : ''}`, sk(S.mult)]);
      if (u.shards) L.push(['1750 · 운석 파편', `종말의 날 후 1·5·7·11시 방향 1.5×1.5칸에 파편 4개 ${pc(S.shards.mult)}`, sk(S.shards.mult) + ' × 4']); }
    if (u.kind === 'shana') L.push([`스킬 · ${S.name}`, `1초 지정 불가 → 가까운 적 최대 ${S.targets}명에게 ${pc(S.mult)} → 가장 먼 적 뒤로 순간이동`, sk(S.mult)]);
    if (u.kind === 'neria') { L.length = 0; L.push(['기본 · 회복', `체력 비율이 가장 낮은 아군 1명을 마법 공격력의 ${pc(D.basic.segs[0].hits[0][1])} 회복 (모션당 2회)`, n(D.basic.segs[0].hits[0][1])], [`스킬 · ${S.name}`, `아군 전체를 마법 공격력의 ${pc(S.mult)} 회복`, sk(S.mult)]); }
    if (u.kind === 'bd') {
      const R = D.rescue, V = D.valiant, ticks = Math.round(R.zoneDur / R.tick);
      L.length = 0;
      L.push([`기본 · ${D.basic.name}`, `음파 투사체 ${pc(D.basic.segs[0].hits[0][1])} (마법)`, n(D.basic.segs[0].hits[0][1])]);
      L.push([`스킬 · ${S.name}`, `아군 전체에 ${S.shieldDur}초 보호막 (마법 공격력의 ${pc(S.shieldMult)})${u.bdShieldT > 0 ? ` · 남은 ${u.bdShieldT.toFixed(1)}초` : ''}`, '보호막 ' + sk(S.shieldMult)]);
      L.push([`${R.name}${u.rescue ? '' : ' (1730 해금)'}`, `스킬 사용 시마다 체력이 가장 낮은 아군 위치에 반경 ${R.radiusCells}칸 장판, ${R.zoneDur}초간 ${R.tick}초마다 장판 안 아군 ${pc(R.healMult)} 회복`, u.rescue ? `회복 ${sk(R.healMult)} × ${ticks}` : '']);
      L.push([`${V.name}${u.valiant ? '' : ' (1770 해금)'}`, `절실한 구원 ${V.every}회째마다 아군 전체 공격력 +${pc(V.buff)} (${V.buffDur}초)${u.valiant ? ` · 다음까지 ${V.every - ((u.rescueN || 0) % V.every)}회` : ''}${u.valT > 0 ? ` · 남은 ${u.valT.toFixed(1)}초` : ''}`, '']);
    }
    if (u.kind === 'federico') L.push([`스킬 · ${S.name}`, `공중에 떠올라 자기 칸 기준 폭 ${S.widthCells}칸(좌우 2칸)으로 전방 끝까지 ${S.beamDur}초간 신성한 광선 · ${S.tick}초마다 ${pc(S.tickMult)}`, `${sk(S.tickMult)} × ${Math.round(S.beamDur / S.tick)}`]);
    if (u.kind === 'silian') L.push([`스킬 · ${S.name}`, `${S.buffDur}초 동안 기본 공격이 전방 ${D.buff.widthCells}x${D.buff.depthCells} 2연속 베기(${pc(D.buff.segs[0].hits[0][1])})로 바뀜 · 지속 중 마나 획득 없음${u.buffT > 0 ? ` (남은 ${u.buffT.toFixed(1)}초)` : ''}`, sk(D.buff.segs[0].hits[0][1]) + ' × 2']);
    if (u.kind === 'hidaka') L.push([`스킬 · ${S.name}`, `${S.spinDur}초간 ${S.tickEvery}초마다 주위 ${S.radiusCells}칸에 ${pc(S.tickMult)} (총 ${Math.round(S.spinDur / S.tickEvery)}회)`, sk(S.tickMult) + ' × ' + Math.round(S.spinDur / S.tickEvery)]);
    if (u.kind === 'bk') {
      const loops = S.loops + (u.asuraPlus ? S.extraLoops1750 : 0), ticks = Math.ceil(loops * S.loop.dur / S.tickEvery);
      L.push([`수라결 (수라결 게이지 100)`, `기본 공격 +10 · 징벌의 파도 +30. 가득 차면 마나보다 우선 발동, 모션이 끝나면 게이지 전부 소모 · 약 ${(S.start.dur + loops * S.loop.dur + S.end.dur).toFixed(1)}초: ${+S.tickEvery.toFixed(2)}초마다 전방 ${S.radiusCells}칸 ${pc(S.tickMult)} × ${ticks} → 마무리 ${S.endRadiusCells}칸 ${pc(S.endMult)}${u.asuraPlus ? ' (1750 +2초)' : ''}`, `${sk(S.tickMult)} × ${ticks} + ${sk(S.endMult)}`]);
      const W = D.wave;
      L.push([`징벌의 파도 (마나 ${u.maxMana})${u.wave ? '' : ' · 1730 해금'}`, `마나가 가득 차면 전방 ${W.lengthCells}칸 직선 ${W.hits.map(h => pc(h[1])).join(' / ')}`, u.wave ? W.hits.map(h => sk(h[1])).join(' / ') : '']);
    }
    if (u.kind === 'aman') L.push([`스킬 · ${S.name}`, `아만 주변 ${S.searchCells}칸 안에서 아군이 가장 많이 모인 ${S.areaCells}×${S.areaCells}칸 → 그 안 아군에게 ${S.shieldDur}초 보호막 (마법 공격력의 ${pc(S.shieldMult)})`, '보호막 ' + sk(S.shieldMult)]);
    if (u.kind === 'lahart') L.push([`스킬 · ${S.name}`, `아군이 가장 많이 들어오는 7×7칸으로 이동해 창을 찍고 ${S.guardDur}초간 범위 안 아군이 받는 피해를 대신 받음 (받는 피해 -${pc(S.reduce)}) → 대신 받은 피해의 ${pc(S.returnRate)}를 범위 안 적에게`, '']);
    if (u.kind === 'azena') {
      const A = AZENA_DEF.skill, I = INANNA_DEF.skill;
      L.push([`아제나 · ${A.name}${u.form === 'inanna' ? '' : ' (다음 스킬)'}`, `거대한 창 ${A.spears}개 (각 3×3칸 ${pc(A.mult)}) → 이난나로 변신`, sk(A.mult) + ' × ' + A.spears]);
      L.push([`이난나 · ${I.name}${u.form === 'inanna' ? ' (다음 스킬)' : ''}`, `맵 중앙에 ${I.treeDur}초간 세계수, 아군 전체 초당 공격력 ${pc(I.healPerSec)} 회복 → 아제나로 변신`, '회복 ' + sk(I.healPerSec) + '/초']);
    }
    return L;
  }
  // 적
  L.push(['기본 공격', '100%', n(1)]);
  if (u.pattern === 'twin' || u.pattern === 'merged') {
    const W = u.pattern === 'merged' ? WHIRL.merged : WHIRL.twin;
    L.push(['회오리 공격', `${W.dur}초간 가장 가까운 적 추적, ${W.tickEvery}초마다 반경 ${(W.radius / 1.6).toFixed(1)}칸에 ${pc(W.tickMult)}`, n(W.tickMult)]);
    if (u.pattern === 'merged') L.push(['칼날 던지기', `회오리 중 4방향 칼날 ${WHIRL.blade.times.length}회, ${pc(WHIRL.blade.mult)}`, n(WHIRL.blade.mult)]);
    else L.push(['체력 공유', '30% 미만이 되면 합체해 검은 산의 포식자로 변신', '']);
  } else if (u.pattern === 'shuheri') {
    const D = u.edef;
    L.push(['돌진 베기', `${D.dash.cd}초마다 가장 먼 적에게 순간 접근해 반경 ${(D.dash.radius / 1.6).toFixed(1)}칸 2회 베기 ${D.dash.hits.map(h => pc(h[1])).join(' / ')}`, D.dash.hits.map(h => n(h[1])).join(' / ')]);
    L.push(['어둠의 주문', `체력 50% 이하에서 1회, 적 전체에 ${pc(D.spell.mult)}`, n(D.spell.mult)]);
    L.push(['하늘의 검', `${D.swords.cd}초마다 아군 ${D.swords.count}명 위치에 붉은 장판 → ${D.swords.delay}초 뒤 검 낙하, 반경 ${(D.swords.radius / 1.6).toFixed(1)}칸 ${pc(D.swords.mult)}`, n(D.swords.mult)]);
    L.push(['스킬 · 광역 베기', `대상 주변 1.5칸에 ${pc(1.9)}`, n(1.9)]);
  } else if (u.pattern === 'valtan') {
    const V = u.vdef, has = (k) => V.order.includes(k); // 마수군단장 발탄(2층)은 휠윈드만
    if (has('charge')) L.push(['돌진 (2회)', `가장 먼 적에게 돌진해 관통, 대상 뒤로 약 ${V.charge.past}칸까지 지나감 · 부딪친 적은 1칸 밀리며 경직 · 매번 다른 대상`, n(V.charge.mult)]);
    if (has('whirl')) L.push(['휠윈드', `${V.whirl.dur}초간 회전하며 가장 가까운 적에게 다가감, 주변 3×3칸 ${V.whirl.tickEvery}초마다${V.ghost ? ' · 첫 사용 시 보스룸 외벽 붕괴' : ''}`, n(V.whirl.tickMult)]);
    if (has('jump')) L.push(['사라졌다 내리찍기', `공중으로 사라졌다가 가장 먼 적에게 내리찍기 (반경 ${V.jump.radiusCells}칸)`, n(V.jump.mult)]);
    if (V.ghost) L.push(['유령 발탄', `쓰러지면 유령으로 부활 · ${V.ghost.dur}초간 피해를 받지 않고 공격 속도·피해 2배 · 그동안 전멸하면 패배`, '']);
  } else if (u.pattern === 'spike') {
    const D = u.edef;
    L.push(['내려찍기', `${D.slam.cd}초마다 붉은 원으로 예고한 곳(반경 ${D.slam.radiusCells}칸)을 내려찍음`, n(D.slam.mult)]);
    L.push(['가시팔 휩쓸기', `${D.sweep.cd}초마다 주변 ${D.sweep.radiusCells}칸 휩쓸기`, n(D.sweep.mult)]);
  } else if (u.pattern === 'willy') {
    const D = u.edef;
    L.push(['호박단 병사 소환', `${D.summon.every}초마다 호박단 병사 1명 (최대 ${D.summon.max})`, '']);
    L.push(['휠윈드', `${D.whirl.dur}초간 회전하며 가장 가까운 적 추적, 주변 3×3칸 ${D.whirl.tickEvery}초마다 · 호박단 병사도 함께 휠윈드`, n(D.whirl.tickMult)]);
  } else if (u.skill === 'nuke') L.push(['스킬 · 강타', `대상 1명에게 ${pc(3.2)}`, n(3.2)]);
  else if (u.skill === 'aoe') L.push(['스킬 · 광역 공격', `대상 주변 1.5칸에 ${pc(1.9)}`, n(1.9)]);
  else if (u.skill === 'dash') L.push(['스킬 · 돌진', `가장 먼 적에게 돌진해 ${pc(3.0)}`, n(3.0)]);
  return L;
}
function drawUnitInfo() {
  const u = infoUnit, v = view.units.get(u.id);
  if (!v || (mode !== 'battle' && mode !== 'wait')) return closeUnitInfo();
  const hp = Math.max(0, Math.round(u.hp)), ally = u.side === 'ally';
  const atk = Math.round(u.atk * (u.dmgMul || 1));
  let mana = '';
  if (u.dh) mana = `<div class="ur"><span>마나</span><b>없음 · ${u.canShotgun ? `${{ pistol: '핸드건', shotgun: '샷건', rifle: '라이플' }[u.stance]} ${u.stanceUses || 0}/${DH.cycle[u.stance].count}` : '핸드건 고정'}</b></div>`;
  else if (u.def || (!u.boss && u.skill)) mana = `<div class="ur"><span>마나</span><b>${Math.floor(u.mana || 0)} / ${u.maxMana}</b></div>`;
  if (u.ident) mana += `<div class="ur"><span>수라결 게이지</span><b>${Math.floor(u.idg || 0)} / 100</b></div>`;
  const sks = skillInfo(u).map(([t, d, dmg]) => `<div class="us"><div class="ust">${t}</div><div class="usd">${d}</div>${dmg ? `<div class="usv">피해 ${dmg}</div>` : ''}</div>`).join('');
  const html = `<div class="un ${ally ? 'a' : 'e'}">${u.name}${ally ? ` <small>Lv.${u.level || 1}</small>` : ''}</div>
    <div class="ur"><span>체력</span><b>${u.alive ? `${hp.toLocaleString()} / ${Math.round(u.maxHp).toLocaleString()}` : '처치됨'}</b></div>
    ${u.shield > 1 ? `<div class="ur"><span>보호막</span><b>${Math.round(u.shield).toLocaleString()}</b></div>` : ''}
    ${mana}
    <div class="ur"><span>${u.side === 'ally' && u.mag ? '마법 공격력' : '공격력'}</span><b>${atk.toLocaleString()}</b></div>${sks}`;
  if (infoEl.dataset.h !== html) { infoEl.innerHTML = html; infoEl.dataset.h = html; }
  const p = view.screenPos(v);
  infoEl.style.left = Math.min(78, Math.max(22, p.x)) + '%'; infoEl.style.top = p.y + '%';
  infoEl.classList.toggle('below', p.y < 45); // 화면 위쪽 유닛은 아래로 표시
}
glHost.addEventListener('pointerdown', (e) => { if (e.button === 0) closeUnitInfo(); }, true);
glHost.addEventListener('pointerdown', (e) => {
  if (mode === 'shop' && e.button === 0) { const u = view.pickUnit(e.clientX, e.clientY); if (u && u.side === 'shop') { tradeUI(u.shopKey); return; } }
  if (!deploying) return;
  const g = view.pickGround(e.clientX, e.clientY);
  const who = g && allies.map(a => ({ a, d: Math.hypot(g.x - a.x, g.z - a.z) })).sort((x, y) => x.d - y.d)[0];
  if (!who || who.d > 1.1) { toast('아군을 길게 눌러 들어 올리세요', '#d9e6ff'); return; }
  glHost.setPointerCapture(e.pointerId);
  press = { id: e.pointerId, lifted: false, who: who.a };
  press.timer = setTimeout(() => { if (!press) return; press.lifted = true; view.lift(press.who.id, true); view.highlightCells(true); }, LIFT_MS);
});
glHost.addEventListener('pointermove', (e) => {
  if (!deploying || !press || !press.lifted) return;
  const g = view.pickGround(e.clientX, e.clientY);
  if (g) view.dragTo(press.who.id, g.x, g.z);
  const c = view.pickCell(e.clientX, e.clientY);
  if (c && c.side === 'ally') { const p = cellToPos('ally', c.col, c.row); view.showHL(p.x, p.z, true); }
  else view.showHL(0, 0, false);
});
const endPress = (e) => {
  if (!press) return;
  clearTimeout(press.timer);
  if (press.lifted) {
    const c = view.pickCell(e.clientX, e.clientY);
    if (c && c.side === 'ally') placeAlly(press.who, c);
    view.lift(press.who.id, false); view.showHL(0, 0, false);
  }
  press = null;
};
glHost.addEventListener('pointerup', endPress);
glHost.addEventListener('pointercancel', endPress);
// 놓은 칸에 다른 아군이 있으면 서로 자리를 바꾼다
function placeAlly(a, c) {
  const unit = run.units[a.id - 1];
  const other = run.units.find(u => u !== unit && u.cell.col === c.col && u.cell.row === c.row);
  if (other) {
    other.cell = { ...unit.cell };
    const oa = allies[run.units.indexOf(other)], op = cellToPos('ally', other.cell.col, other.cell.row);
    oa.x = op.x; oa.z = op.z;
  }
  const p = cellToPos('ally', c.col, c.row);
  a.x = p.x; a.z = p.z; unit.cell = { col: c.col, row: c.row };
}

function beginFight() {
  unmountSheet();
  deploying = false; if (press) { clearTimeout(press.timer); view.lift(press.who.id, false); press = null; } view.highlightCells(false); view.showHL(0, 0, false);
  view.showBoard(false); // 전투 개시 후에는 아군/적군 진영 색 표시를 숨긴다
  $('#bbot').innerHTML = `<div class="spd">${[1, 2, 4].map(s => `<button class="btn sm ${s === speed ? 'on' : ''}" data-s="${s}">${s}x</button>`).join('')}<button class="btn sm ghost" id="skipb">즉시 승리</button></div>`;
  $('#bbot').querySelectorAll('[data-s]').forEach(b => b.onclick = () => { speed = +b.dataset.s; view.speed = speed; $('#bbot').querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', +x.dataset.s === speed)); });
  $('#skipb').onclick = () => { for (const u of battle.units) if (u.side === 'enemy' && u.alive) battle._kill(u); };
  view.speed = speed; acc = 0; lastT = performance.now();
  requestAnimationFrame(tick);
}

function tick(now) {
  if (mode !== 'battle' || !battle) return;
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  acc += dt * speed;
  const STEP = 1 / 30;
  while (acc >= STEP && !battle.over) {
    battle.step(STEP); battle.post(); acc -= STEP;
    if (battle.events.length) { view.handle(battle.events, battle); battle.events.length = 0; }
  }
  if (battle.events.length) { view.handle(battle.events, battle); battle.events.length = 0; }
  // HUD
  const ck = $('#clock'); if (ck) ck.textContent = `${battle.t.toFixed(1)}s${battle.enraged ? ' · 광폭화' : ''}`;
  document.querySelectorAll('.bb').forEach(el => {
    const b = battle.units.find(u => u.id === +el.dataset.id); if (!b) return;
    if (b.shared && b.shared.merged && !b.alive && b.hp > 0) { el.style.display = 'none'; return; } // 합체로 사라진 개체
    const nm = el.querySelector('.bbn'); if (nm && nm.dataset.n !== b.name) { nm.dataset.n = b.name; nm.innerHTML = `${b.name}<small>${b.desc || ''}</small>`; el.classList.toggle('merged', b.pattern === 'merged'); }
    el.querySelector('.bbh i').style.width = Math.max(0, b.hp / b.maxHp * 100) + '%';
    let g = '';
    if (b.pattern === 'gauge' || b.pattern === 'master') g = `광역 게이지 ${Math.round(b.gauge * 100)}%`;
    if (b.stag) g = `무력화 ${Math.min(100, Math.round(b.stag.got / b.stag.need * 100))}% · ${b.stag.t.toFixed(1)}s`;
    if (b.fortShield > 0) g = `보호막 ${Math.round(b.shield)} · ${b.fortShield.toFixed(1)}s`;
    if (b.invulnT > 0) g = `무적 ${b.invulnT.toFixed(1)}s`;
    if (b.ghost) g = `유령 발탄 · ${Math.max(0, b.ghostT).toFixed(1)}초 버티기`;
    if (b.shared) g = (b.shared.merged ? '합체 완료' : `공유 체력 · ${Math.round(b.shared.merge.at * 100)}% 미만에서 합체`) + (b.pattern === 'merged' ? '' : '');
    if (!b.alive) g = '처치';
    el.querySelector('.bbg').textContent = g;
  });
  updateStance(); updateMeter();
  if (battle.over) { setTimeout(() => endBattle(battle.over), 1300); return; }
  requestAnimationFrame(tick);
}

async function endBattle(result) {
  meterSnap();
  const cfgCoins = battle.cfg.coins.v;
  run.coins = cfgCoins; // 금화의 군주 강탈·회수 반영
  run.stats.battles++;
  if (result === 'lose') return gameOver(false);
  allies.forEach((a, i) => { run.units[i].hpPct = Math.max(0, a.hp / a.maxHp); });
  const kind = roomKind, f = run.floor;
  const exp = { battle: 45, rift: 55, ambush: 60, elite: 70, boss: 90 }[kind]; // 1층을 다 돌면 약 Lv5
  const ups = G.gainExp(run, exp); // 파티 인원으로 나눠 받는다
  const healFrac = (run.asc >= 5 ? 0.15 : 0.3) + (run.meta?.healAfter || 0);
  { // 낙원의 유산 복원석: 전투 승리마다 지급 (런 밖에 저장)
    const ms = M.loadMeta(), got = { battle: 1, rift: 1, elite: 2, boss: 3 }[kind] || 1; ms.stones += got; M.saveMeta(ms);
    setTimeout(() => toast(`복원석 +${got} (낙원의 유산)`, '#9ad0ff'), 300);
  }
  if (kind === 'boss') for (const u of run.units) u.hpPct = 1; else G.healLost(run, healFrac);
  const head = `${kind === 'boss' ? '보스 처치!' : '승리!'} · 경험치 +${exp}${run.units.length > 1 ? ` (1인당 ${Math.round(G.expShare(run, exp))})` : ''}${ups ? ` · <b style="color:#7ee08a">레벨 업 Lv.${run.unit.level}</b>` : ''} · ${kind === 'boss' ? '체력 전부 회복' : `잃은 체력 ${healFrac * 100}% 회복`}`;
  view.active = false; hud.innerHTML = '';

  if (kind === 'battle' || kind === 'rift' || kind === 'ambush') {
    const coin = G.coinGain(run, 18 + 4 * f);
    await wait(done => choose({ title: '전투 승리', sub: head, skip: null,
      options: [coinOption(coin), { title: '추가 회복', img: HEAL_IMG, desc: '최대 체력 20% 회복', color: '#7ee08a', apply: () => G.healPct(run, 0.2) }, paradiseOption()], onDone: done })); // 일반 전투에서는 장비가 나오지 않는다
    if (kind === 'rift') {
      // 균열의 틈: 낙원 유물 2개 또는 경험치 중 하나 + 장신구 1개 (고정)
      const gen = () => [paradiseOption(), paradiseOption(), expOption(70)];
      await wait(done => choose({ title: '균열의 틈 보상', sub: '하나를 고르세요 · 장신구는 따로 받습니다', options: gen(), gen, skip: null, onDone: done }));
      await accReward('균열의 틈 보상 · 장신구');
    }
  } else if (kind === 'elite') {
    // 정예: 장비 2개 또는 경험치 중 하나 + 장신구 1개
    const gen = () => [...Array.from({ length: 2 }, () => equipOption(G.makeEquip(run, { minTier: Math.random() < 0.5 ? 2 : 1 }))), expOption(80)];
    await wait(done => choose({ title: '정예 처치', sub: head + '<br>장비 또는 경험치를 고르세요', options: gen(), gen, skip: null, onDone: done }));
    await accReward('정예 처치 · 장신구');
  } else if (kind === 'boss') {
    run.coins += G.coinGain(run, 40 + 10 * f);
    const gen = () => Array.from({ length: 3 }, () => paradiseOption());
    await wait(done => choose({ title: `${f}층 보스 처치`, sub: head + `<br>재화 +${G.coinGain(run, 40 + 10 * f)} · 낙원 유물 하나를 고르세요`, options: gen(), gen, onDone: done }));
    await wait(done => choose({ title: `${f}층 보스 처치 · 추가 보상`, sub: '장비 또는 경험치', skip: null, options: [equipOption(G.makeEquip(run, { minTier: 2 })), expOption(120)], onDone: done }));
    await accReward(`${f}층 보스 처치 · 장신구`, f >= 3 ? { grade: 1 } : {}); // 부활한 발탄 = 유물 장신구
    return nextFloor();
  }
  waitPhase();
}

// ───────── 피해량 미터 (가한 피해량 / 입은 피해량) — 전투·준비 단계에서 오른쪽에 표시, 접기/펴기 ─────────
// 전투 중 = 이번 전투 실시간 / 준비 단계 = 직전 전투 결과
let meterTab = 'dealt', meterOpen = true, meterEl = null;
try { meterOpen = localStorage.getItem('rift_meter') !== '0'; } catch {}
function meterSnap() { if (!battle || !run) return; run.lastMeter = allies.map((a, i) => ({ key: run.units[i]?.key, name: a.name, dealt: a.dealt || 0, dealtM: a.dealtM || 0, taken: a.taken || 0 })); }
function meterRows() {
  if (mode === 'battle' && battle && !deploying) return allies.map((a, i) => ({ key: run.units[i]?.key, name: a.name, dealt: a.dealt || 0, dealtM: a.dealtM || 0, taken: a.taken || 0, dead: !a.alive }));
  return run.lastMeter || run.units.map(u => ({ key: u.key, name: UNITS[u.key].name, dealt: 0, taken: 0 }));
}
function mountMeter() {
  meterEl = h(`<div class="meter${meterOpen ? '' : ' shut'}">
    <button class="mt-tog" title="접기/펴기"></button>
    <div class="mt-box"><div class="mt-tabs"><button data-t="dealt">가한 피해량</button><button data-t="taken">입은 피해량</button></div>
    <div class="mt-sub"></div><div class="mt-rows"></div><div class="mt-leg"></div></div></div>`);
  hud.appendChild(meterEl);
  $('.mt-tog', meterEl).onclick = (e) => { e.stopPropagation(); meterOpen = !meterOpen; try { localStorage.setItem('rift_meter', meterOpen ? '1' : '0'); } catch {} meterEl.classList.toggle('shut', !meterOpen); };
  meterEl.querySelectorAll('[data-t]').forEach(b => b.onclick = (e) => { e.stopPropagation(); meterTab = b.dataset.t; meterEl.dataset.h = ''; updateMeter(); });
  meterEl.addEventListener('pointerdown', e => e.stopPropagation());
  updateMeter();
}
function updateMeter() {
  if (!meterEl || !meterEl.isConnected) return;
  const rows = meterRows().slice().sort((a, b) => b[meterTab] - a[meterTab]);
  const max = Math.max(1, ...rows.map(r => r[meterTab]));
  const live = mode === 'battle' && !deploying;
  const html = rows.map(r => { const U = UNITS[r.key] || {}; return `<div class="mt-r${r.dead ? ' dead' : ''}"><img src="${U.img || ''}" alt=""><div><b>${U.name || r.name}</b><span>${Math.round(r[meterTab]).toLocaleString()}</span><i>${meterTab === 'dealt' ? `<s class="ph" style="width:${(r.dealt - (r.dealtM || 0)) / max * 100}%"></s><s class="mg" style="width:${(r.dealtM || 0) / max * 100}%"></s>` : `<s class="tk" style="width:${r.taken / max * 100}%"></s>`}</i></div></div>`; }).join('');
  const key = meterTab + html + live;
  if (meterEl.dataset.h === key) return; meterEl.dataset.h = key;
  meterEl.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === meterTab));
  $('.mt-sub', meterEl).textContent = live ? '이번 전투 · 실시간' : (run.lastMeter ? '직전 전투' : '전투 기록 없음');
  $('.mt-rows', meterEl).innerHTML = html;
  meterEl.classList.toggle('taken', meterTab === 'taken');
  $('.mt-leg', meterEl).innerHTML = meterTab === 'dealt' ? '<i class="ph"></i>물리 <i class="mg"></i>마법' : '<i class="tk"></i>받은 피해';
}

// 레벨업으로 열린 클래스 기능 알림
function flushUnlocks() {
  const msgs = run?.unlockMsgs || []; if (!msgs.length) return;
  run.unlockMsgs = [];
  const m = modal(`<div class="mt">클래스 기능 해금</div><div class="ms">균열 레벨이 올라 새 기능이 열렸습니다</div>
    <div class="list">${msgs.map(x => `<div class="li"><b style="color:#ffd166">${x.split(' — ')[0]}</b><span>${x.split(' — ')[1] || ''}</span></div>`).join('')}</div>
    <div class="mrow"><button class="btn" id="ok">확인</button></div>`);
  $('#ok', m).onclick = closeModal;
}

// ───────── 대기 단계 (전투 전·후) · 장비 창 ─────────
// 전투 전: 배치 + 장비 / 전투 후: 위치 변경 + 장비 → '지도 보기'로 지도 복귀
// 아래로 스크롤(또는 손잡이 클릭·위로 쓸기)하면 장비 창이 올라온다
let sheet = null, sheetPhase = null, sheetOpen = false, selUnit = 0, selRef = null, pickMode = null;
const TIER_COL = ['', '#9aa0aa', '#5aa0ff', '#ffb84a'];

function waitPhase() {
  mode = 'wait'; closeUnitInfo(); screen.innerHTML = ''; view.clear(); view.active = true; view.speed = 1; view.setTheme(stageTheme(roomKind === 'boss' ? 'battle' : roomKind));
  allies = G.makeAllies(run); ally = null;
  battle = new Battle(allies, [], G.battleCfg(run, 'battle'));
  for (const u of allies) view.addUnit(u);
  deploying = true; view.showBoard(true); view.highlightCells(true);
  hud.innerHTML = '';
  hud.appendChild(h(`<div class="bh">
    <div class="btop"><div class="bt">${run.floor}층 · 대기 단계</div><div class="bclock">정비</div></div>
    <div class="bbot" id="bbot"><div class="dtip">아군을 <b>길게 눌러</b> 위치를 바꿀 수 있습니다<br><small>아래로 스크롤하면 장비 창 · 장비를 필드의 영웅 위에 끌어 놓으면 장착</small></div>
      <button class="btn big" id="tomap">지도 보기</button></div></div>`));
  $('#tomap').onclick = leaveWait;
  mountSheet('post');
  mountMeter();
  flushUnlocks();
}
function leaveWait() { unmountSheet(); deploying = false; view.showBoard(false); view.clear(); battle = null; showMap(); }

function mountSheet(phase) {
  unmountSheet();
  sheetPhase = phase; selUnit = Math.min(selUnit, run.units.length - 1); selRef = null; pickMode = null;
  sheet = h(`<div class="wsheet"><div class="whandle"><i></i><span></span></div><div class="wbody"></div></div>`);
  hud.appendChild(sheet); hud.classList.add('ws');
  const hd = $('.whandle', sheet);
  let y0 = null;
  hd.addEventListener('pointerdown', e => { y0 = e.clientY; hd.setPointerCapture(e.pointerId); });
  hd.addEventListener('pointerup', e => { if (y0 === null) return; const dy = e.clientY - y0; y0 = null; if (dy < -25) setSheet(true); else if (dy > 25) setSheet(false); else setSheet(!sheetOpen); });
  setSheet(false); renderSheet();
}
function unmountSheet() { if (sheet) sheet.remove(); sheet = null; sheetOpen = false; hud.classList.remove('ws'); if (view) { view.setShift(0); view.showHL(0, 0, false); } }
function setSheet(open) {
  if (!sheet) return;
  sheetOpen = open; sheet.classList.toggle('open', open);
  $('.whandle span', sheet).textContent = open ? '▼ 접기 (위로 스크롤)' : '▲ 장비 · 소모품 (아래로 스크롤)';
  view.setShift(open ? app.clientHeight * 0.4 : 0);
}
app.addEventListener('wheel', (e) => {
  if (!sheet || modalRoot.children.length) return;
  const body = e.target.closest && e.target.closest('.wbody');
  if (body && ((e.deltaY > 0 && body.scrollTop + body.clientHeight < body.scrollHeight - 2) || (e.deltaY < 0 && body.scrollTop > 0))) return; // 창 안쪽 스크롤 우선
  if (e.deltaY > 15 && !sheetOpen) setSheet(true);
  else if (e.deltaY < -15 && sheetOpen) setSheet(false);
}, { passive: true });

// 참조: {t:'bag', i} | {t:'eq', u, slot} | {t:'potion'} | {t:'hone'} | {t:'unit', u}
const refItem = (r) => r?.t === 'bag' ? run.bag[r.i] : r?.t === 'eq' ? run.units[r.u].eq[r.slot] : null;
const sameRef = (a, b) => a && b && a.t === b.t && a.i === b.i && a.u === b.u && a.slot === b.slot;
function itemCell(it, ref, extra = '') {
  const data = `data-ref='${JSON.stringify(ref)}'`;
  if (!it) return `<div class="wit empty" ${data}>${extra}</div>`;
  const on = sameRef(selRef, ref) ? ' on' : '';
  if (it.acc) return `<div class="wit acc ${A.ACC_GRADE_BG[it.grade]}${on}" ${data} draggable="false"><img src="${A.accImg(it)}" draggable="false"></div>`;
  return `<div class="wit t${it.tier}${on}" ${data} draggable="false"><img src="${EQUIP_IMG(it.kind, it.tier)}" draggable="false"><b>${'★'.repeat(it.tier)}</b>${it.opt ? '<s>+</s>' : ''}</div>`;
}
// 가방 칸 목록: 장비 → 회복 물약(3개씩) → 연마 도구(3개씩) → 빈칸 (킹갓캐슬처럼 한 가방에 같이 놓인다)
function bagCells() {
  const cells = run.bag.map((it, i) => ({ ref: { t: 'bag', i }, it }));
  for (const [k, t, img, name] of [['potions', 'potion', 'img/eq/it_potion.png', '회복 물약'], ['hones', 'hone', 'img/eq/it_hone.png', '1티어 강화 재료'], ['hones2', 'hone2', 'img/eq/it_hone2.png', '2티어 강화 재료']]) {
    let n = run[k] || 0, s = 0;
    while (n > 0) { const c = Math.min(G.STACK, n); cells.push({ ref: { t, s }, cons: { img, n: c, name } }); n -= c; s++; }
  }
  while (cells.length < G.BAG_SLOTS) cells.push({ ref: { t: 'bag', i: run.bag.length + cells.length }, empty: true });
  return cells.slice(0, Math.max(G.BAG_SLOTS, cells.length));
}
function consCell(c) {
  const on = selRef && selRef.t === c.ref.t ? ' on' : '';
  return `<div class="wit cons${on}" data-ref='${JSON.stringify(c.ref)}'><img src="${c.cons.img}" draggable="false"><b class="stk">${c.cons.n}</b></div>`;
}
const atkName = (key) => G.isMag(key) ? '마법 공격력' : '공격력';
function equipNote(it, key) {
  const E = EQUIP[it.kind];
  if (E.stat === 'matk' && !G.isMag(key)) return ' <small class="warn">(물리 유닛이라 주옵션 미적용)</small>';
  if (E.stat === 'atk' && G.isMag(key)) return ' <small class="warn">(마법 유닛이라 주옵션 미적용)</small>';
  return '';
}
function renderSheet() {
  if (!sheet) return;
  const U = run.units[selUnit], UD = UNITS[U.key], st = G.computeStats(run, U), hp = hpLine(U);
  const bag = bagCells().map(c => c.cons ? consCell(c) : itemCell(c.it, c.ref)).join('');
  // 선택 정보 + 행동 버튼
  let info = '', acts = '';
  const it = refItem(selRef);
  if (pickMode === 'merge') info = `<div class="wi-h">합성할 장비를 고르세요</div><div class="wi-d">같은 티어 장비를 누르면 다음 티어가 됩니다 · 같은 종류면 같은 종류, 섞으면 무작위</div>`, acts = `<button class="btn xs ghost" data-act="cancel">취소</button>`;
  else if (pickMode === 'hone' || pickMode === 'hone2') { const t = pickMode === 'hone2' ? 2 : 1; info = `<div class="wi-h">강화할 ${t}티어 장비를 고르세요</div><div class="wi-d">${t}티어 강화 재료 1개로 ${t}티어 장비가 같은 종류의 ${t + 1}티어 장비가 됩니다${t === 2 ? ' (3티어가 되면 추가 옵션 생성)' : ''}</div>`; acts = `<button class="btn xs ghost" data-act="cancel">취소</button>`; }
  else if (it && it.acc) {
    info = `<div class="wi-h" style="color:${A.ACC_GRADE_COL[it.grade]}">${A.ACC_GRADES[it.grade]} ${A.accName(it)} <small>${A.ACC_SLOTS[it.slot]}</small></div><div class="wi-d">${A.accLines(it).map(l => `<span${l.tier != null ? ` style="color:${A.OPT_TIER_COL[l.tier]}"` : ''}>${l.text}${l.tier != null ? ` (${A.OPT_TIER[l.tier]})` : ''}</span>`).join(' · ')}</div>`;
    if (selRef.t === 'bag') acts = `<button class="btn xs" data-act="equip">${UD.name}에게 장착</button><button class="btn xs ghost" data-act="sell">판매 ${coinIco}${G.sellPrice(it)}</button>`;
    else acts = `<button class="btn xs ghost" data-act="unequip">장착 해제</button><button class="btn xs ghost" data-act="sell">판매 ${coinIco}${G.sellPrice(it)}</button>`;
  } else if (it) {
    info = `<div class="wi-h" style="color:${TIER_COL[it.tier]}">${it.tier}티어 ${G.equipName(it)} <small>${EQUIP[it.kind].slot}${it.kind === 'mweapon' ? ' · 마법' : it.kind === 'weapon' ? ' · 물리' : ''}</small></div><div class="wi-d">${G.equipText(it)}${it.opt === 'mana' ? ' <small>(데빌헌터는 공격력 +6%로 대체)</small>' : ''}${equipNote(it, U.key)}</div>`;
    if (selRef.t === 'bag') acts = `<button class="btn xs" data-act="equip">${UD.name}에게 장착</button>${it.tier < 3 ? '<button class="btn xs ghost" data-act="merge">합성</button>' : ''}<button class="btn xs ghost" data-act="sell">판매 ${coinIco}${G.sellPrice(it)}</button>`;
    else acts = `<button class="btn xs ghost" data-act="unequip">장착 해제</button><button class="btn xs ghost" data-act="sell">판매 ${coinIco}${G.sellPrice(it)}</button>`;
  } else if (selRef?.t === 'potion') info = `<div class="wi-h">회복 물약 ×${run.potions}</div><div class="wi-d">유닛 1명의 체력 50% 회복 · 한 칸에 3개씩 쌓임</div>`, acts = run.potions ? `<button class="btn xs" data-act="potion">${UD.name}에게 사용</button>` : '';
  else if (selRef?.t === 'hone' || selRef?.t === 'hone2') { const t = selRef.t === 'hone2' ? 2 : 1, n = run[t === 2 ? 'hones2' : 'hones']; info = `<div class="wi-h">${t}티어 강화 재료 ×${n}</div><div class="wi-d">${t}티어 장비 1개를 같은 종류의 ${t + 1}티어로 강화 · 한 칸에 3개씩 쌓임</div>`; acts = n ? `<button class="btn xs" data-act="${selRef.t}">장비 강화</button>` : ''; }
  else info = `<div class="wi-d">장비·장신구를 눌러 정보 보기 · <b>끌어서</b> 영웅이나 장비(3칸)·장신구 칸에 놓아 장착 · 같은 티어 장비 위에 놓아 합성 · 판매가는 구매가의 50%</div>`;
  // 장신구 칸 (선택한 유닛): 귀걸이 · 반지 · 목걸이 · 팔찌
  const accRow = `<div class="wacc">${A.ACC_SLOT_KEYS.map(k => `<div class="waslot"><span>${A.ACC_SLOTS[k]}</span>${itemCell(U.eq[k], { t: 'eq', u: selUnit, slot: k })}</div>`).join('')}</div>`;
  const slot = (k, i) => `<div class="weq"><span>장비 ${i + 1}</span>${itemCell(U.eq[k], { t: 'eq', u: selUnit, slot: k })}</div>`;
  const party = run.units.map((u, i) => { const p = hpLine(u); return `<div class="wpu${i === selUnit ? ' on' : ''}" data-ref='{"t":"unit","u":${i}}'><img src="${UNITS[u.key].img}"><small>Lv.${u.level}</small><i style="width:${p.pct * 100}%"></i></div>`; }).join('');
  $('.wbody', sheet).innerHTML = `
    <div class="wbag">${bag}</div>
    <div class="winfo">${accRow}${info}<div class="wacts">${acts}</div></div>
    <div class="wunit"><img class="wpor" src="${UD.img}">
      <div class="wus"><div class="wun">${UD.name} <small>Lv.${U.level}</small></div>
        <div class="bar hp"><i style="width:${hp.pct * 100}%"></i><span>${hp.hp.toLocaleString()} / ${hp.max.toLocaleString()}</span></div>
        <div class="wst"><span>${atkName(U.key)} <b>${Math.round(st.atk * st.dmgMul)}</b></span><span>치명 <b>${Math.round(st.crit * 100)}%</b></span><span>치명 피해 <b>${Math.round(st.critDmg * 100)}%</b></span>${st.takenMul < 1 ? `<span>받는 피해 <b>-${Math.round((1 - st.takenMul) * 100)}%</b></span>` : ''}${st.manaPlus ? `<span>마나 <b>+${st.manaPlus}/타</b></span>` : ''}${st.rangePlus ? `<span>사거리 <b>+1칸</b></span>` : ''}${st.skillShield ? `<span>스킬 보호막 <b>${st.skillShield * 100}%</b></span>` : ''}</div></div>
      <div class="weqs">${EQ_SLOTS.map(slot).join('')}</div></div>
    <div class="wparty">${party}</div>
    <div class="wfoot"><span class="wcoin">${coinIco} ${run.coins}</span><button class="btn" data-act="${sheetPhase === 'pre' ? 'fight' : 'map'}">${sheetPhase === 'pre' ? '전투 개시' : '지도 보기'}</button><span class="wcoin">🎒 ${G.bagUsed(run)}/${G.BAG_SLOTS}</span></div>`;
  $('.wbody', sheet).querySelectorAll('[data-act]').forEach(b => b.onclick = () => sheetAct(b.dataset.act));
}
function sheetChanged() {
  // 전투 전이면 전투 유닛 능력치를 바로 갱신 (위치·체력 비율 유지)
  if (battle) allies.forEach((a, i) => { const f = G.makeAlly(run, run.units[i], a.id); const { x, z } = a; Object.assign(a, f, { x, z }); battle._init(a); });
  renderSheet();
}
// 장비 칸: 종류와 관계없이 3칸(e0~e2). 칸을 지정하지 않으면 빈 칸 → 선택한 칸 → 첫 칸 순서로 넣는다
function eqSlotFor(it, U, want) {
  if (it.acc) return it.slot;
  if (want && EQ_SLOTS.includes(want)) return want;
  const empty = EQ_SLOTS.find(k => !U.eq[k]); if (empty) return empty;
  if (selRef?.t === 'eq' && run.units[selRef.u] === U && EQ_SLOTS.includes(selRef.slot)) return selRef.slot;
  return 'e0';
}
function equipTo(ref, ui, want) {
  const it = refItem(ref); if (!it) return;
  const U = run.units[ui], sl = eqSlotFor(it, U, want), old = U.eq[sl];
  if (ref.t === 'bag') { run.bag.splice(ref.i, 1); if (old) run.bag.push(old); }
  else { if (ref.u === ui && ref.slot === sl) return; run.units[ref.u].eq[ref.slot] = old || null; } // 다른 칸(다른 유닛 포함)으로 옮기면 서로 맞바꾼다
  U.eq[sl] = it; selUnit = ui; selRef = { t: 'eq', u: ui, slot: sl };
  toast(`${UNITS[U.key].name} · ${G.equipName(it)} 장착`, it.acc ? A.ACC_GRADE_COL[it.grade] : TIER_COL[it.tier]);
}
function mergeRefs(a, b) {
  const A = refItem(a), B = refItem(b);
  if (a.t !== 'bag' || b.t !== 'bag') { toast('가방에 있는 장비끼리만 합성할 수 있습니다', '#ff9a8a'); return false; }
  if (A?.acc || B?.acc) { toast('장신구는 합성할 수 없습니다', '#ff9a8a'); return false; }
  if (!G.canMerge(A, B)) { toast(A && B && A.tier === 3 ? '3티어는 최고 티어입니다' : '같은 티어 장비끼리만 합성할 수 있습니다', '#ff9a8a'); return false; }
  const n = G.mergeEquip(A, B);
  run.bag = run.bag.filter(x => x !== A && x !== B); run.bag.push(n);
  selRef = { t: 'bag', i: run.bag.length - 1 };
  toast(`합성 · ${n.tier}티어 ${G.equipName(n)}${n.opt ? ' · ' + EQUIP_OPTS[n.opt].name : ''}`, TIER_COL[n.tier]);
  return true;
}
function honeRef(r, t = 1) {
  const key = t === 2 ? 'hones2' : 'hones';
  const it = refItem(r); if (!it || !run[key]) return;
  if (!G.honeEquip(it, t)) { toast(`${t}티어 강화 재료는 ${t}티어 장비에만 쓸 수 있습니다`, '#ff9a8a'); return; }
  run[key]--; toast(`강화 · ${it.tier}티어 ${G.equipName(it)}${it.opt ? ' · ' + EQUIP_OPTS[it.opt].name : ''}`, TIER_COL[it.tier]);
}
function usePotion(ui) {
  if (!run.potions) return; const U = run.units[ui];
  if (U.hpPct >= 1) { toast('체력이 가득 찼습니다'); return; }
  run.potions--; U.hpPct = Math.min(1, U.hpPct + 0.5); toast(`${UNITS[U.key].name} 체력 50% 회복`, '#7ee08a');
}
function sheetAct(a) {
  const it = refItem(selRef);
  if (a === 'fight') return beginFight();
  if (a === 'map') return leaveWait();
  if (a === 'cancel') pickMode = null;
  if (a === 'equip' && it) equipTo(selRef, selUnit);
  if (a === 'unequip' && it) { if (G.bagUsed(run) + 1 > G.BAG_SLOTS) { toast('가방이 가득 찼습니다', '#ff9a8a'); return; } run.units[selRef.u].eq[selRef.slot] = null; run.bag.push(it); selRef = null; }
  if (a === 'sell' && it) { // 판매가 = 구매가의 50% (장착 중인 것도 바로 판매)
    run.coins += G.sellPrice(it); if (selRef.t === 'bag') run.bag.splice(selRef.i, 1); else run.units[selRef.u].eq[selRef.slot] = null;
    toast(`판매 · 재화 +${G.sellPrice(it)}`, '#ffd166'); selRef = null; $('.bclock') && ($('.bclock').innerHTML = coinIco + ' ' + run.coins); }
  if (a === 'merge') { pickMode = 'merge'; }
  if (a === 'hone' || a === 'hone2') { pickMode = a; }
  if (a === 'potion') usePotion(selUnit);
  sheetChanged();
}
// 누르기(선택)와 끌어 놓기(장착·합성·사용)
function fieldAlly(x, y) { const u = view.pickUnit(x, y); return u && u.side === 'ally' && allies.includes(u) ? u : null; }
let drag = null;
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest && e.target.closest('.wsheet [data-ref]'); if (!el || !sheet) return;
  drag = { ref: JSON.parse(el.dataset.ref), x: e.clientX, y: e.clientY, el, ghost: null };
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8 && drag.ref.t !== 'unit' && !drag.el.classList.contains('empty')) {
    drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('ghost'); app.appendChild(drag.ghost);
  }
  if (drag.ghost) {
    const r = app.getBoundingClientRect(); drag.ghost.style.left = (e.clientX - r.left - 26) + 'px'; drag.ghost.style.top = (e.clientY - r.top - 26) + 'px';
    const fu = fieldAlly(e.clientX, e.clientY); view.showHL(fu ? fu.x : 0, fu ? fu.z : 0, !!fu); // 필드 영웅 위에 올리면 발밑 표시
  }
});
document.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.ghost) {
    d.ghost.remove();
    view.showHL(0, 0, false);
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const t = el?.closest?.('.wsheet [data-ref]');
    if (t) { dropOn(d.ref, JSON.parse(t.dataset.ref)); return; }
    if (el?.closest?.('.wsheet')) return;
    const fu = fieldAlly(e.clientX, e.clientY); // 필드에 나가 있는 영웅 위에 놓으면 그 영웅에게 장착·사용
    if (fu) dropOn(d.ref, { t: 'unit', u: fu.id - 1 });
    return;
  }
  tapRef(d.ref);
});
function tapRef(r) {
  if (r.t === 'unit') { selUnit = r.u; if (pickMode === null && selRef?.t === 'eq') selRef = null; return renderSheet(); }
  if (pickMode === 'merge' && r.t === 'bag' && refItem(r) && !sameRef(r, selRef)) { mergeRefs(selRef, r); pickMode = null; return sheetChanged(); }
  if ((pickMode === 'hone' || pickMode === 'hone2') && refItem(r)) { honeRef(r, pickMode === 'hone2' ? 2 : 1); pickMode = null; selRef = r; return sheetChanged(); }
  pickMode = null;
  if (r.t === 'eq' && !refItem(r)) { selRef = null; return renderSheet(); }
  if (r.t === 'bag' && !refItem(r)) { selRef = null; return renderSheet(); }
  selRef = r; renderSheet();
}
function dropOn(from, to) {
  const it = refItem(from);
  if (from.t === 'potion') { if (to.t === 'unit') usePotion(to.u); else if (to.t === 'eq') usePotion(to.u); return sheetChanged(); }
  if (from.t === 'hone' || from.t === 'hone2') { if (refItem(to)) honeRef(to, from.t === 'hone2' ? 2 : 1); return sheetChanged(); }
  if (!it) return;
  if (to.t === 'unit') { equipTo(from, to.u); return sheetChanged(); }
  if (to.t === 'eq') {
    if (it.acc && to.slot !== it.slot) { toast(`${A.ACC_SLOTS[it.slot]}는 ${A.ACC_SLOTS[it.slot]} 칸에만 장착할 수 있습니다`, '#ff9a8a'); return; }
    if (!it.acc && !EQ_SLOTS.includes(to.slot)) { toast('장비는 장비 칸(3칸)에만 장착할 수 있습니다', '#ff9a8a'); return; }
    equipTo(from, to.u, to.slot); return sheetChanged();
  }
  if (to.t === 'bag') {
    if (from.t === 'bag' && refItem(to)) { mergeRefs(from, to); return sheetChanged(); }
    if (from.t === 'eq') { // 장착 해제해서 가방으로
      if (G.bagUsed(run) + 1 > G.BAG_SLOTS) { toast('가방이 가득 찼습니다', '#ff9a8a'); return; }
      run.units[from.u].eq[from.slot] = null; run.bag.push(it); selRef = null; return sheetChanged();
    }
  }
}

function nextFloor() {
  run.cleared++;
  if (run.floor >= G.MAX_FLOOR) return gameOver(true);
  run.floor++; run.floorBattles = 0;
  run.map = G.genMap(run);
  run.devReveal = false;
  toast(`${run.floor}층에 입장했습니다`, '#e0703a');
  showMap();
}

function gameOver(cleared) {
  mode = 'over'; view.active = false; hud.innerHTML = '';
  const reached = cleared ? G.MAX_FLOOR : run.floor;
  const sc = G.score(run);
  const secs = Math.round((Date.now() - run.startTime) / 1000);
  const m = modal(`<div class="mt">${cleared ? '차원의 균열 정복!' : '런 종료'}</div>
    <div class="ms">${cleared ? `${G.MAX_FLOOR}층 부활한 발탄을 처치했습니다.` : `${run.floor}층에서 쓰러졌습니다. 도달한 층까지 보상을 받습니다.`}</div>
    <div class="stats">
      <span>도달 층 <b>${reached}</b></span>
      <span>플레이 시간 <b>${Math.floor(secs / 60)}분 ${secs % 60}초</b></span><span>전투 <b>${run.stats.battles}회</b></span>
      <span>최종 레벨 <b>${run.unit.level}</b></span>
    </div>
    <div class="score"><div class="sc-h">점수 <b>${sc.total.toLocaleString()}</b></div>
      ${sc.parts.map(([a, d, v]) => `<div class="sc-r"><span>${a} <small>${d}</small></span><b>${v.toLocaleString()}</b></div>`).join('')}</div>
    <div class="ms small">점수 = 영웅 성장도 + 장비·장신구·유물 등급 + 보유 재화</div>
    <div class="mrow"><button class="btn" id="re">처음으로</button></div>`);
  $('#re', m).onclick = () => { closeModal(); paradise(); };
}

// ───────── 부팅 ─────────
(async () => {
  const ld = $('#loading');
  view = new View($('#gl'), $('#ov'));
  try {
    await view.load((p, n) => { ld.querySelector('i').style.width = (p * 100) + '%'; ld.querySelector('span').textContent = `에셋 불러오는 중… ${Math.round(p * 100)}%`; });
  } catch (e) { ld.querySelector('span').textContent = '에셋 로드 실패: ' + e.message; console.error(e); return; }
  ld.remove();
  charSelect();
  window.__rift = { get run() { return run; }, get battle() { return battle; }, view, G, M, startBattle, showMap, title, enterRoom, mainMenu, paradise, charSelect, fieldScreen, riftSetup, relicUI, waitPhase, recruitRoom: () => recruitRoom(), reward: () => endBattle("win"), shopRoom: () => shopRoom(), nextFloor: () => nextFloor(), showUnitInfo: (x, y) => showUnitInfo(x, y), gameOver: (c) => gameOver(c), recruitUI: (p) => recruitUI(p, k => unitDesc(k)), INANNA: INANNA_DEF, AZENA: AZENA_DEF };
  document.title = '차원의 균열 시뮬레이터';
  window.__ready = true;
})();

// 전투 시뮬레이션 (렌더링과 분리된 순수 로직)
import { DH, WHIRL as WW, AZENA, INANNA } from './data.js';
// Battle.step(dt)을 호출하면 상태가 진행되고, 연출용 이벤트가 events 배열에 쌓인다.

export const CELL = 1.6, GAP = 1.0;
const G_pick = (a) => a[Math.floor(Math.random() * a.length)];
export const COLS = 7, ROWS_SIDE = 4;
export function cellToPos(side, col, row) {
  // row: 0 = 전열(중앙에 가까움) ~ 3 = 후열
  const x = (col - (COLS - 1) / 2) * CELL;
  const z = (row + 0.5) * CELL + GAP;
  return { x, z: side === 'ally' ? z : -z };
}
export const BOUNDS = { x: (COLS / 2) * CELL + 0.6, z: ROWS_SIDE * CELL + GAP + 0.6 };

const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Battle {
  constructor(allies, enemies, cfg) {
    this.t = 0;
    this.units = [...allies, ...enemies];
    this.cfg = cfg; // { team, legacies:Set, ult:Set, enrageT, coins:{v}, boss:bool }
    this.events = [];
    this.over = null; // 'win' | 'lose'
    this.nextId = 1000;
    this.stolen = 0;
    this.bahunturUsed = false;
    this.silianT = 0; this.azenaT = 0; this.addT = 0;
    this.enraged = false;
    this.teamBuffT = { ally: 0, enemy: 0 };
    for (const u of this.units) this._init(u);
    this.res = cfg.res || new Set(); this.resT = { cup: 0, bell: 0 }; this.resUsed = {};
    if (cfg.startShield) for (const u of this.units) if (u.side === 'ally' && u.alive) this.addShield(u, u.maxHp * cfg.startShield);
  }

  _init(u) {
    u.alive = u.hp > 0;
    u.action = null; u.mana = u.mana || 0; u.shield = u.shield || 0;
    u.dealt = 0; u.dealtM = 0; u.awakeUsed = 0; u.atkCount = 0; u.nextMul = 1;
    u.taunt = null; u.tauntT = 0; u.markT = 0; u.invulnT = 0; u.stunT = 0;
    u.swiftT = 0; u.ninavCd = 0; u.supT = 0; u.patT = 0; u.patT2 = 0; u.patT3 = 0;
    u.gauge = 0; u.clownUsed = false; u.stag = null; u.fortT = 0; u.fortShield = 0;
    u.moving = false; u.face = u.side === 'ally' ? Math.PI / 2 : -Math.PI / 2; u.stance = 'pistol'; u.stanceUses = 0;
    if (!u.alive) u.dead = true;
  }

  get allies() { return this.units.filter(u => u.side === 'ally'); }
  foes(u) { return this.units.filter(o => o.alive && o.side !== u.side); }
  friends(u) { return this.units.filter(o => o.alive && o.side === u.side); }
  ev(e) { this.events.push(e); }

  step(dt) {
    if (this.over) return;
    this.t += dt;
    const cfg = this.cfg, L = cfg.legacies;

    // 광폭화
    if (!this.enraged && this.t >= cfg.enrageT) {
      this.enraged = true;
      this.ev({ t: 'banner', msg: '광폭화! 적의 피해와 공격 속도가 증가합니다', color: '#ff5050' });
    }
    // 유산: 실리안 (30초마다 광역 강타), 아제나 (낙인)
    if (L.has('silian')) {
      this.silianT += dt;
      if (this.silianT >= 30) {
        this.silianT = 0;
        const al = this.friends({ side: 'ally' }); const avg = al.reduce((s, u) => s + u.atk, 0) / Math.max(1, al.length);
        this.ev({ t: 'banner', msg: '실리안의 유산 · 광역 강타', color: '#ffd166' });
        for (const e of this.foes({ side: 'ally' })) this.deal({ ...al[0], atk: avg, side: 'ally', id: -1, crit: 0, critDmg: 1, dmgMul: 1, skillDmg: 0, bossDmg: 0 }, e, 2.5, { pure: true });
      }
    }
    if (L.has('azena')) {
      this.azenaT += dt;
      if (this.azenaT >= 6) {
        this.azenaT = 0; const f = this.foes({ side: 'ally' });
        if (f.length) { const m = f[Math.floor(Math.random() * f.length)]; m.markT = 6; this.ev({ t: 'text', id: m.id, msg: '낙인', color: '#ff9de2' }); }
      }
    }
    // 보스전 잡몹 소환
    if (cfg.summonAdd) {
      this.addT += dt;
      if (this.addT >= 15 && this.units.some(u => u.boss && u.alive)) {
        this.addT = 0;
        for (let i = 0; i < 2; i++) {
          const a = cfg.summonAdd();
          a.id = this.nextId++; a.x = rnd(-4, 4); a.z = -BOUNDS.z + 0.8; this._init(a); a.alive = true;
          this.units.push(a); this.ev({ t: 'spawn', id: a.id });
        }
      }
    }
    this._resonance(dt);
    this._zones(dt);
    this.teamBuffT.ally = Math.max(0, this.teamBuffT.ally - dt);
    this.teamBuffT.enemy = Math.max(0, this.teamBuffT.enemy - dt);

    for (const u of this.units) {
      if (!u.alive) continue;
      u.markT = Math.max(0, u.markT - dt); u.invulnT = Math.max(0, u.invulnT - dt);
      u.tauntT = Math.max(0, u.tauntT - dt); u.swiftT = Math.max(0, u.swiftT - dt);
      u.ninavCd = Math.max(0, u.ninavCd - dt); if (u.buffT > 0) u.buffT = Math.max(0, u.buffT - dt); u.untargetT = Math.max(0, (u.untargetT || 0) - dt);
      if (u.bdShieldT > 0) { u.bdShieldT -= dt; if (u.bdShieldT <= 0) { u.shield = Math.max(0, u.shield - u.bdShield); u.bdShield = 0; } } // 수호의 연주 보호막 만료
      if (u.valT > 0) u.valT = Math.max(0, u.valT - dt); // 용맹의 세레나데
      if (u.tmpShieldT > 0) { u.tmpShieldT -= dt; if (u.tmpShieldT <= 0) { u.shield = Math.max(0, u.shield - u.tmpShield); u.tmpShield = 0; } } // 장비 보호막 4초 만료
      if (u.knock) { // 밀려남 (발탄 돌진): 경직 상태로 일정 거리 밀린다
        const K = u.knock, st = Math.min(K.left, K.v * dt); K.left -= st;
        u.x = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, u.x + K.dx * st)); u.z = Math.max(-BOUNDS.z, Math.min(BOUNDS.z, u.z + K.dz * st));
        if (K.left <= 0.001) u.knock = null;
      }
      if (u.manaRegen && !u.noMana && u.maxMana) u.mana = Math.min(u.maxMana, (u.mana || 0) + u.manaRegen * dt); // 장신구: 초당 마나 자연 회복
      if (u.stunT > 0) { u.stunT -= dt; u.moving = false; continue; }

      // 아이덴티티: 서포터 지속 회복
      if (u.idt === 'support') {
        u.supT += dt;
        if (u.supT >= 5) { u.supT = 0; for (const f of this.friends(u)) this.heal(f, f.maxHp * 0.03, true); }
      }
      if (u.boss) this._bossTick(u, dt);
      if (!u.alive || this.over) continue;
      if (u.ww) { u.moving = true; continue; } // 회오리 공격 중에는 일반 행동을 하지 않는다
      if (u.sw) { this._spinTick(u, dt); u.moving = true; continue; } // 휠윈드 (발탄 · 윌리윌리 · 호박단 병사)

      if (u.action) {
        const a = u.action;
        a.t += dt * a.spd;
        if (a.update) a.update(a.t, dt);
        if (a.hits) { for (const h of a.hits) if (!h.done && a.t >= h.at) { h.done = true; h.fn(); } }
        else if (!a.done && a.t >= a.hitAt) { a.done = true; a.fn(); }
        if (u.faceLock != null) u.face = u.faceLock; // 스킬 시전 중 방향 고정
        if (a.t >= a.dur) { u.action = null; u.faceLock = null; a.onEnd?.(); }
        u.moving = false;
        continue;
      }

      const tgt = this._target(u);
      if (!tgt) { u.moving = false; continue; }
      const d = dist(u, tgt);
      const reach = (u.dh ? DH[u.stance].range : u.range) + (u.rangeBonus || 0) + u.rad + tgt.rad;
      u.face = Math.atan2(-(tgt.z - u.z), tgt.x - u.x);
      if (d > reach) {
        const sp = u.speed * (1 + (u.moveSpd || 0)) * (u.side === 'ally' && this.res.has('horn') && this.t < 5 ? 1.3 : 1) * dt;
        let vx = (tgt.x - u.x) / d, vz = (tgt.z - u.z) / d;
        // 우회: 앞길을 같은 편 유닛(멈춰서 싸우는 중)이 막고 있으면 옆으로 돌아서 간다
        const fx = vx, fz = vz; let blk = null, bl = 1e9;
        for (const o of this.units) {
          if (o === u || !o.alive || o.side !== u.side || (o.moving && !o.action)) continue;
          const rx = o.x - u.x, rz = o.z - u.z, along = rx * fx + rz * fz;
          if (along <= 0 || along > Math.min(d, 2.4)) continue;
          const lat = rx * -fz + rz * fx; // +면 진행 방향 왼쪽
          if (Math.abs(lat) < u.rad + o.rad + 0.2 && along < bl) { bl = along; blk = lat; }
        }
        if (blk !== null && !(u.detourT > 0)) { u.detourS = blk > 0 ? -1 : 1; u.detourT = 0.7; }
        u.blockT = blk !== null ? (u.blockT || 0) + dt : 0;
        if (u.blockT > 1.4) { // 오래 막히면 다른 상대를 노린다
          u.blockT = 0; let alt = null, ad = 1e9;
          for (const o of this.units) { if (!o.alive || o.side === u.side || o === tgt || o.untargetT > 0) continue; const dd = dist(u, o); if (dd < ad) { ad = dd; alt = o; } }
          if (alt) u.focus = alt; u.detourS = -(u.detourS || 1);
        }
        if (u.detourT > 0) {
          u.detourT -= dt; const k = 1.6 * u.detourS;
          vx += -fz * k; vz += fx * k; // 진행 방향에 수직으로 비켜 간다
          if (blk === null && u.detourT > 0.25) u.detourT = 0.25; // 길이 트이면 곧 원래 방향으로
        }
        // 겹침 방지
        for (const o of this.units) {
          if (o === u || !o.alive) continue;
          const dd = dist(u, o), m = u.rad + o.rad;
          if (dd < m && dd > 0.001) { vx += (u.x - o.x) / dd * 0.8; vz += (u.z - o.z) / dd * 0.8; }
        }
        const n = Math.hypot(vx, vz) || 1;
        u.x += vx / n * Math.min(sp, d - reach + 0.05);
        u.z += vz / n * Math.min(sp, d - reach + 0.05);
        u.x = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, u.x));
        u.z = Math.max(-BOUNDS.z, Math.min(BOUNDS.z, u.z));
        u.moving = true;
      } else {
        u.moving = false;
        this._startAction(u, tgt);
      }
    }

    this._separate(dt);

    // 검은 산의 포식자 칼날
    if (this.blades) for (let i = this.blades.length - 1; i >= 0; i--) {
      const b = this.blades[i], step = b.speed * dt;
      b.x += b.dx * step; b.z += b.dz * step; b.dist += step;
      for (const a of this.foes(b.src)) if (!b.hit.has(a.id) && Math.hypot(a.x - b.x, a.z - b.z) <= 0.9 + a.rad) { b.hit.add(a.id); this.deal(b.src, a, WW.blade.mult, {}); }
      if (b.dist >= b.max) this.blades.splice(i, 1);
    }

    // 승패
    const a = this.units.some(u => u.side === 'ally' && u.alive);
    const e = this.units.some(u => u.side === 'enemy' && u.alive && !u.add);
    if (!e) { this.over = 'win'; for (const u of this.units) if (u.add && u.alive) this._kill(u); this.ev({ t: 'end', result: 'win' }); }
    else if (!a && !this._pendingRevive) { this.over = 'lose'; this.ev({ t: 'end', result: 'lose' }); }
    else if (this.t > 150) { this.over = 'lose'; this.ev({ t: 'end', result: 'lose', timeout: true }); }
  }

  // 같은 편 유닛끼리 겹치지 않게 밀어낸다 (2026-10-31): 이동 중에만 피하던 것을 서 있거나 공격·순간이동 후에도 적용
  // 겹친 거리의 절반씩 서로 반대로 (프레임마다 조금씩 → 튀지 않게). 밀려나는 중·회전 공격 중·공중에 뜬 유닛은 제외
  _separate(dt) {
    const L = this.units.filter(u => u.alive && !u.knock && !u.sw && !u.ww && !u.airborne && !u.noCollide);
    const k = Math.min(1, dt * 12);
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j]; if (a.side !== b.side) continue;
      const m = (a.rad + b.rad) * 0.95; let dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d >= m) continue;
      if (d < 0.001) { const g = (a.id * 7 + b.id * 13) % 6.283; dx = Math.cos(g); dz = Math.sin(g); d = 1; } else { dx /= d; dz /= d; d = Math.hypot(b.x - a.x, b.z - a.z); }
      const push = (m - d) * 0.5 * k, wa = a.boss ? 0 : 1, wb = b.boss ? 0 : 1, ws = (wa + wb) || 1; // 보스는 밀리지 않는다
      a.x -= dx * push * 2 * wa / ws; a.z -= dz * push * 2 * wa / ws; b.x += dx * push * 2 * wb / ws; b.z += dz * push * 2 * wb / ws;
      for (const u of [a, b]) { u.x = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, u.x)); u.z = Math.max(-BOUNDS.z, Math.min(BOUNDS.z, u.z)); }
    }
  }

  // 낙원의 유산 공명 (9단계 이상 유물 전부)
  _resonance(dt) {
    const R = this.res; if (!R.size) return;
    const al = this.units.filter(u => u.side === 'ally' && u.alive); if (!al.length) return;
    if (R.has('cup')) { // 모래말림
      this.resT.cup += dt;
      if (this.resT.cup >= 12) {
        this.resT.cup = 0; const foes = this.foes({ side: 'ally' }); if (foes.length) {
          let spot = foes[0], bn = -1; const RR = 1.5 * CELL;
          for (const f of foes) { const n = foes.filter(o => dist(o, f) <= RR).length; if (n > bn) { bn = n; spot = f; } }
          this.sand = { x: spot.x, z: spot.z, t: 3, tick: 0, atk: al.reduce((a, u) => a + u.atk, 0) / al.length };
          this.ev({ t: 'banner', msg: '공명 · 모래말림', color: '#ffd166' });
        }
      }
      if (this.sand) {
        const S = this.sand; S.t -= dt; S.tick += dt;
        if (S.tick >= 0.5) { S.tick = 0; this.ev({ t: 'fx', kind: 'ring', x: S.x, z: S.z, r: 1.5 * CELL, color: '#e8c070' });
          for (const f of this.foes({ side: 'ally' })) if (dist(f, S) <= 1.5 * CELL + f.rad) this.deal({ ...al[0], atk: S.atk, side: 'ally', id: -2, crit: 0, critDmg: 1, dmgMul: 1, skillDmg: 0, bossDmg: 0 }, f, 0.15, { pure: true }); } // 0.5초마다 15% = 초당 30%
        if (S.t <= 0) this.sand = null;
      }
    }
    if (R.has('bell')) { // 수호의 종
      this.resT.bell += dt;
      if (this.resT.bell >= 20) { this.resT.bell = 0; for (const u of al) this.addShield(u, u.maxHp * 0.06); this.ev({ t: 'banner', msg: '공명 · 수호의 종', color: '#7fd0ff' }); }
    }
    if (R.has('horn') && this.t < 5 && !this.resUsed.horn) { this.resUsed.horn = true; this.ev({ t: 'banner', msg: '공명 · 돌격 나팔', color: '#e9a95a' }); }
  }

  _target(u) {
    if (u.taunt && u.tauntT > 0 && u.taunt.alive && !(u.taunt.untargetT > 0)) return u.taunt;
    if (u.focus && u.focus.alive && !(u.focus.untargetT > 0)) return u.focus;
    u.focus = null;
    let best = null, bd = 1e9;
    for (const o of this.units) {
      if (!o.alive || o.side === u.side || o.untargetT > 0) continue;
      const d = dist(u, o);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  _atkSpd(u) {
    let s = 1 + (u.atkSpd || 0);
    if (u.idt === 'rage') s *= 1 + 0.6 * (1 - u.hp / u.maxHp);
    if (u.swiftT > 0) s *= 2;
    if (u.side === 'enemy' && this.enraged) s *= 1.5;
    if (u.ghost) s *= u.vdef.ghost.atkSpd;
    return s;
  }

  // 데빌헌터 스탠스: 기본 공격 사용 횟수로 순환 (핸드건 5회 → 샷건 3회 → 라이플 2회 → 핸드건)
  _countStance(u) {
    if (!u.canShotgun) return; // 1750 미만은 핸드건 고정
    const C = DH.cycle[u.stance];
    u.stanceUses = (u.stanceUses || 0) + 1;
    if (u.stanceUses < C.count) return;
    u.stance = C.next; u.stanceUses = 0; this._skillShield(u);
    const T = { shotgun: ['샷건 스탠스', '#ffb36b'], pistol: ['핸드건 스탠스', '#9fd8ff'], rifle: ['라이플 스탠스', '#c7ff8a'] }[u.stance];
    this.ev({ t: 'stance', id: u.id, stance: u.stance });
    this.ev({ t: 'text', id: u.id, msg: T[0], color: T[1] });
  }

  _dhAction(u, tgt, spd) {
    // 데빌헌터는 마나를 쓰지 않는다 (스탠스 순환이 스킬 역할). 퀵 샷 분기는 비활성.
    if (!u.noMana && u.mana >= u.maxMana) {
      u.mana = 0;
      const S = DH.skill;
      u.action = { kind: 'skill', t: 0, dur: S.dur, hitAt: S.hitAt, spd: 1, fn: () => {
        const tt = tgt.alive ? tgt : this._target(u); if (!tt) return;
        this.ev({ t: 'proj', from: u.id, to: tt.id, color: '#ffe08a', big: true });
        this.deal(u, tt, S.mult * (u.skillMul || 1), { skill: true });
        this.ev({ t: 'fx', kind: 'burst', x: tt.x, z: tt.z, r: 1.3, color: '#ffe08a' });
        if (this.cfg.ult.has('mana') && tt.alive) this.deal(u, tt, S.mult * 0.6 * (u.skillMul || 1), { skill: true });
        if (this.cfg.ult.has('swift')) u.swiftT = 3;
        if (this.cfg.legacies.has('shandi') && Math.random() < 0.35) { u.mana = u.maxMana; this.ev({ t: 'text', id: u.id, msg: '샨디 · 마나 충전', color: '#9ad0ff' }); }
      } };
      this.ev({ t: 'act', id: u.id, kind: 'skill', clip: S.clip, dur: S.dur });
      this.ev({ t: 'text', id: u.id, msg: S.name, color: '#ffe08a' });
      return;
    }
    if (u.stance === 'shotgun') {
      const G = DH.shotgun, dur = G.dur / spd;
      const hits = G.hits.map(([at, m], i) => ({ at: at / spd, fn: () => {
        const tt = tgt.alive ? tgt : this._target(u); if (!tt) return;
        // 전방 원뿔: 대상 + 대상 주변 적
        const fx = tt.x - u.x, fz = tt.z - u.z, fl = Math.hypot(fx, fz) || 1;
        this.ev({ t: 'vfx', kind: 'dh_shotgun', from: u.id, to: tt.id, big: i === 3 });
        for (const e of this.foes(u)) {
          if (e !== tt) { const ex = e.x - u.x, ez = e.z - u.z; if ((ex * fx + ez * fz) <= 0 || dist(e, tt) > G.cone + e.rad) continue; }
          this.deal(u, e, m * (1 + (u.shotgunDmg || 0)), {});
          if (this.cfg.legacies.has('kadan') && e.alive) this.deal(u, e, 0.5 * m, {});
        }
        u.mana = Math.min(u.maxMana, u.mana + G.mana * (1 + (u.manaGain || 0)));
      } }));
      u.action = { kind: 'attack', t: 0, dur, spd: 1, hits, onEnd: () => this._countStance(u) };
      this.ev({ t: 'act', id: u.id, kind: 'attack', clip: G.clip, dur });
      return;
    }
    const rifle = u.stance === 'rifle';
    if (rifle) { // 라이플은 체력이 가장 적은 적을 노린다
      const low = this.foes(u).filter(f => !(f.untargetT > 0)).sort((a, b) => a.hp - b.hp)[0];
      if (low) { tgt = low; u.face = Math.atan2(-(tgt.z - u.z), tgt.x - u.x); }
    }
    // 권총은 01 → 02 두 구간을 이어서 한 번의 공격으로, 라이플은 단일 클립
    const segs = rifle ? [DH.rifle] : DH.pistol.segs;
    const mana = rifle ? DH.rifle.mana : DH.pistol.mana;
    let off = 0; const hits = [], clips = [];
    for (const sg of segs) {
      for (const [at, m] of sg.hits) hits.push({ at: (off + at) / spd, fn: () => {
        const tt = tgt.alive ? tgt : this._target(u); if (!tt) return;
        this.ev({ t: 'vfx', kind: rifle ? 'dh_rifle' : 'dh_pistol', from: u.id, to: tt.id });
        this.deal(u, tt, m * (1 + ((rifle ? u.rifleDmg : u.pistolDmg) || 0)), {});
        if (this.cfg.legacies.has('kadan') && tt.alive) this.deal(u, tt, 0.7 * m, {});
        u.mana = Math.min(u.maxMana, u.mana + mana * (1 + (u.manaGain || 0)));
      } });
      clips.push({ clip: sg.clip, dur: sg.dur / spd });
      off += sg.dur;
    }
    const dur = off / spd;
    u.action = { kind: 'attack', t: 0, dur, spd: 1, hits, onEnd: () => this._countStance(u) };
    this.ev({ t: 'act', id: u.id, kind: 'attack', clips, dur });
  }

  // 소서리스·샤나: 모션 구간(segs)을 이어서 재생하고, 구간 안의 판정 시점(hits)마다 기본 공격 1회 (마나 +5)
  // 브레이커 아이덴티티 게이지 (1750 해금): 기본 공격 적중마다 충전, 가득 차면 다음 행동이 징벌의 파도
  _idGain(u, v) { if (u.ident) u.idg = Math.min(100, (u.idg || 0) + v * (1 + (u.manaGain || 0))); }

  // 브레이커 스킬 수라결 (마나 50, 약 6초): 시작 → 연타 반복 → 마무리. 연타 중 전방 주변 지속 피해, 마무리 광역 강타
  _asuraAction(u, tgt, spd) {
    const A = u.def.skill; this._skillShield(u);
    const loops = A.loops + (u.asuraPlus ? A.extraLoops1750 : 0); // 1750: +2초
    const segs = [A.start, ...Array(loops).fill(A.loop), A.end];
    const clips = segs.map(sg => ({ clip: sg.clip, dur: sg.dur / spd }));
    const dur = segs.reduce((a, sg) => a + sg.dur, 0) / spd;
    const t0 = A.start.dur, t1 = A.start.dur + loops * A.loop.dur, R = A.radiusCells * CELL, hits = [];
    const center = () => { const f = u.face; return { x: u.x + Math.cos(f) * 0.9, z: u.z - Math.sin(f) * 0.9 }; };
    hits.push({ at: 0.05, fn: () => this.ev({ t: 'vfx', kind: 'bk_asura_on', from: u.id }) });
    for (let t = t0; t < t1 - 1e-6; t += A.tickEvery) hits.push({ at: t / spd, fn: () => {
      const c = center(); let any = false;
      for (const f of this.foes(u)) if (dist(f, c) <= R + f.rad) { this.deal(u, f, A.tickMult * (u.skillMul || 1), { skill: true }); any = true; }
      this.ev({ t: 'vfx', kind: 'bk_punch', from: u.id, x: c.x, z: c.z, hit: any });
    } });
    hits.push({ at: (t1 + A.endAt) / spd, fn: () => {
      const c = center(), R2 = A.endRadiusCells * CELL;
      this.ev({ t: 'vfx', kind: 'bk_asura_end', from: u.id, x: c.x, z: c.z, r: R2 });
      for (const f of this.foes(u)) if (dist(f, c) <= R2 + f.rad) this.deal(u, f, A.endMult * (u.skillMul || 1), { skill: true });
      if (this.cfg.ult.has('swift')) u.swiftT = 3;
    } });
    // 수라결 도중 범위 안에 적이 없으면 가장 가까운 적 앞으로 빠르게 이동 (2026-10-31)
    const update = (t, dt) => {
      if (t < t0 / spd || t > t1 / spd) return;
      const c = center(); if (this.foes(u).some(f => dist(f, c) <= R + f.rad)) return;
      let tt = null, bd = 1e9; for (const f of this.foes(u)) { if (f.untargetT > 0) continue; const d = dist(u, f); if (d < bd) { bd = d; tt = f; } }
      if (!tt) return;
      const want = tt.rad + u.rad + 0.15, step = Math.min(14 * dt, Math.max(0, bd - want));
      if (step <= 0) return;
      u.x += (tt.x - u.x) / bd * step; u.z += (tt.z - u.z) / bd * step; u.face = Math.atan2(-(tt.z - u.z), tt.x - u.x);
      u.x = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, u.x)); u.z = Math.max(-BOUNDS.z, Math.min(BOUNDS.z, u.z));
      if (!u._dashFx || this.t - u._dashFx > 0.25) { u._dashFx = this.t; this.ev({ t: 'vfx', kind: 'bk_dash', from: u.id }); }
    };
    u.action = { kind: 'skill', t: 0, dur, spd: 1, hits, update, onEnd: () => { u.idg = 0; } }; // 수라결 모션이 끝나면 게이지 전부 소모
    this.ev({ t: 'act', id: u.id, kind: 'skill', clips, dur });
    this.ev({ t: 'text', id: u.id, msg: A.name, color: '#ff6a5a' });
  }

  // 브레이커 아이덴티티: 징벌의 파도 (전방 직선 5타)
  _waveAction(u, tgt, spd) {
    const S = u.def.wave; u.mana -= u.maxMana; this._skillShield(u);
    this._idGain(u, u.def.identity.onSkill); // 징벌의 파도 사용 시 수라결 게이지 +30
    const clips = S.segs.map(sg => ({ clip: sg.clip, dur: sg.dur / spd }));
    const dur = S.segs.reduce((a, sg) => a + sg.dur, 0) / spd;
    const fx0 = tgt.x - u.x, fz0 = tgt.z - u.z, fl = Math.hypot(fx0, fz0) || 1, dx = fx0 / fl, dz = fz0 / fl, L = S.lengthCells * CELL;
    const hits = S.hits.map(([at, m], i) => ({ at: at / spd, fn: () => {
      this.ev({ t: 'vfx', kind: 'bk_wave', from: u.id, dx, dz, len: L, big: i === S.hits.length - 1 });
      for (const f of this.foes(u)) {
        const rx = f.x - u.x, rz = f.z - u.z, along = rx * dx + rz * dz, side = Math.abs(rx * dz - rz * dx);
        if (along < -0.3 || along > L + f.rad || side > S.width / 2 + f.rad) continue;
        this.deal(u, f, m * (u.skillMul || 1), { skill: true });
      }
    } }));
    u.action = { kind: 'skill', t: 0, dur, spd: 1, hits };
    this.ev({ t: 'act', id: u.id, kind: 'skill', clips, dur });
    this.ev({ t: 'text', id: u.id, msg: S.name, color: '#ffd166' });
  }

  _seqAction(u, tgt, spd) {
    if (u.kind === 'bd' && u.mana >= u.maxMana) return this._bardSkill(u, tgt, spd);
    if (u.kind === 'bk') { // 수라결 게이지 100이 마나보다 우선
      if ((u.idg || 0) >= 100) return this._asuraAction(u, tgt, spd);
      if (u.wave && u.mana >= u.maxMana) return this._waveAction(u, tgt, spd);
    }
    const D = u.def, buffed = u.buffT > 0, isSkill = !buffed && u.mana >= u.maxMana && u.kind !== 'bk';
    if (isSkill && u.castSpd) spd *= 1 + u.castSpd; // 장신구: 스킬 시전 속도
    const segs = isSkill ? D.skill.segs : buffed ? D.buff.segs : D.basic.segs;
    const clips = segs.map(sg => ({ clip: sg.clip, dur: sg.dur / spd }));
    const dur = segs.reduce((a, sg) => a + sg.dur, 0) / spd;
    const hits = [];
    const cur = () => (tgt.alive && !(tgt.untargetT > 0) ? tgt : this._target(u));
    if (buffed) {
      // 실리안 강화 베기: 전방 3x2 (폭 widthCells, 깊이 depthCells) 범위, 지속 중 마나 획득 없음
      const B = D.buff; let off = 0;
      for (const sg of segs) {
        for (const [at, m] of sg.hits) hits.push({ at: (off + at) / spd, fn: () => {
          const tt = cur(); if (tt) u.face = Math.atan2(-(tt.z - u.z), tt.x - u.x);
          const dx = Math.cos(u.face), dz = -Math.sin(u.face), L = B.depthCells * CELL + 0.4, W = B.widthCells * CELL;
          this.ev({ t: 'vfx', kind: 'silian_slash', from: u.id });
          for (const f of this.foes(u)) {
            const rx = f.x - u.x, rz = f.z - u.z, along = rx * dx + rz * dz, side = Math.abs(rx * dz - rz * dx);
            if (along < -0.3 || along > L + f.rad || side > W / 2 + f.rad) continue;
            this.deal(u, f, m * (u.skillMul || 1), { skill: true });
          }
        } });
        off += sg.dur;
      }
    } else if (!isSkill && u.healer) {
      // 힐러 기본 공격: 아군 중 체력 비율이 가장 낮은 1명 회복 (마법 공격력 × 계수), 회복할 때마다 마나 +5
      let off = 0;
      for (const sg of segs) {
        for (const [at, m] of sg.hits) hits.push({ at: (off + at) / spd, fn: () => {
          const f = this.friends(u).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (!f) return;
          this.heal(f, u.atk * (u.dmgMul || 1) * m);
          this.ev({ t: 'vfx', kind: 'heal', from: u.id, to: f.id });
          u.mana = Math.min(u.maxMana, u.mana + u.manaPerHit * (1 + (u.manaGain || 0)));
        } });
        off += sg.dur;
      }
    } else if (!isSkill) {
      let off = 0;
      for (const sg of segs) {
        for (const [at, m] of sg.hits) hits.push({ at: (off + at) / spd, fn: () => {
          const tt = cur(); if (!tt) return;
          const reach = u.range + (u.rangeBonus || 0) + u.rad + tt.rad + 0.6;
          if (dist(u, tt) > reach) return; // 대상이 사거리 밖으로 벗어나면 빗나감
          this.ev({ t: 'vfx', kind: { sr: 'sr_energy', federico: 'fed_shot', bd: 'bd_shock', shana: 'shana_hit', bk: 'bk_hit', hidaka: 'hidaka_hit', silian: 'hidaka_hit', aman: 'am_bolt' }[u.kind], from: u.id, to: tt.id });
          this.deal(u, tt, m, {});
          if (u.kind === 'bk') this._idGain(u, D.identity.gaugePerHit);
          if (this.cfg.legacies.has('kadan') && tt.alive) this.deal(u, tt, 0.7 * m, {});
          u.mana = Math.min(u.maxMana, u.mana + u.manaPerHit * (1 + (u.manaGain || 0)));
        } });
        off += sg.dur;
      }
    } else {
      u.mana -= u.maxMana; // 스킬 사용 후 최대 마나만큼 소모
      this._skillShield(u);
      const S = D.skill;
      this.ev({ t: 'text', id: u.id, msg: S.name, color: '#ffe08a' });
      if (u.kind === 'sr') {
        // 시전 시점에 적이 가장 많이 모인 지점을 정하고 마법진 표시 → 2.43초 뒤 운석 낙하 (3×3칸)
        const R = S.radiusCells * CELL, foes0 = this.foes(u);
        let spot = { x: tgt.x, z: tgt.z }, bn = -1;
        for (const f of foes0) { const n = foes0.filter(o => dist(o, f) <= R).length; if (n > bn) { bn = n; spot = { x: f.x, z: f.z }; } }
        this.ev({ t: 'vfx', kind: 'sr_meteor_cast', from: u.id, x: spot.x, z: spot.z, impactIn: S.impact / spd });
        hits.push({ at: S.impact / spd, fn: () => {
          this.ev({ t: 'vfx', kind: 'sr_meteor_hit', x: spot.x, z: spot.z });
          for (const f of this.foes(u)) if (dist(f, spot) <= R + f.rad) this.deal(u, f, S.mult * (u.skillMul || 1), { skill: true });
        } });
        if (u.shards) { // 1750: 운석 파편 4개가 1·5·7·11시 방향으로 튄다 (화면 위쪽 = 12시)
          const H = S.shards;
          hits.push({ at: (S.impact + 0.05) / spd, fn: () => {
            const pts = H.clock.map(h => { const a = h / 12 * Math.PI * 2; return { x: spot.x + Math.sin(a) * H.distCells * CELL, z: spot.z - Math.cos(a) * H.distCells * CELL }; });
            this.ev({ t: 'vfx', kind: 'sr_shards', x: spot.x, z: spot.z, pts, delay: H.at / spd });
          } });
          hits.push({ at: (S.impact + H.at) / spd, fn: () => {
            for (const h of H.clock) {
              const a = h / 12 * Math.PI * 2, p = { x: spot.x + Math.sin(a) * H.distCells * CELL, z: spot.z - Math.cos(a) * H.distCells * CELL };
              for (const f of this.foes(u)) if (Math.abs(f.x - p.x) <= H.radiusCells * CELL + f.rad && Math.abs(f.z - p.z) <= H.radiusCells * CELL + f.rad) this.deal(u, f, H.mult * (u.skillMul || 1), { skill: true });
            }
          } });
        }
      } else if (u.kind === 'lahart') {
        // 수호의 창: 아군이 가장 많이 들어오는 7×7 위치로 이동 → 창을 찍고 5초간 아군 피해 대신 받기(받는 피해 -80%) → 받은 피해의 50% 방출
        const half = S.areaCells * CELL / 2, al = this.friends(u).filter(f => f !== u);
        let best = { x: u.x, z: u.z }, bn = -1;
        for (const c of [u, ...al]) { const n = al.filter(f => Math.abs(f.x - c.x) <= half && Math.abs(f.z - c.z) <= half).length; if (n > bn) { bn = n; best = { x: c.x, z: c.z }; } }
        if (al.length) { best.x = al.reduce((a, f) => a + f.x, 0) / al.length; best.z = Math.max(best.z, al.reduce((a, f) => a + f.z, 0) / al.length - CELL * 0.6); }
        hits.push({ at: 0.15 / spd, fn: () => { u.x = best.x; u.z = best.z; this.ev({ t: 'tele', id: u.id }); this.ev({ t: 'vfx', kind: 'lh_dash', from: u.id }); } });
        hits.push({ at: S.plantAt / spd, fn: () => {
          this.guard = { u, x: u.x, z: u.z, half, until: this.t + S.guardDur / spd, stored: 0, reduce: S.reduce };
          this.ev({ t: 'vfx', kind: 'lh_guard', from: u.id, half, dur: S.guardDur / spd });
          this.ev({ t: 'text', id: u.id, msg: '수호의 창 · 피해 대신 받기', color: '#9ad0ff' });
        } });
        hits.push({ at: S.releaseAt / spd, fn: () => {
          const G = this.guard; this.guard = null; if (!G) return;
          const v = Math.round(G.stored * S.returnRate);
          this.ev({ t: 'vfx', kind: 'lh_release', x: G.x, z: G.z, half });
          if (v > 0) for (const f of this.foes(u)) if (Math.abs(f.x - G.x) <= half + f.rad && Math.abs(f.z - G.z) <= half + f.rad) this.deal(u, f, 0, { flat: v, pure: true });
          this.ev({ t: 'text', id: u.id, msg: `방출 ${v.toLocaleString()}`, color: '#ffd166' });
        } });
      } else if (u.kind === 'azena') {
        if (u.form !== 'inanna') {
          // 아제나 · 고대의 창: 적에게 거대한 창 3개 (각 3×3칸 250%) → 이난나로 변신
          const R = S.radiusCells * CELL, foes0 = this.foes(u);
          const picks = foes0.map(f => ({ f, n: foes0.filter(o => dist(o, f) <= R).length })).sort((a, b) => b.n - a.n).map(o => o.f);
          for (let k = 0; k < S.spears; k++) {
            const at = (S.firstAt + k * S.every) / spd;
            hits.push({ at: Math.max(0, at - 0.55 / spd), fn: () => { const live = this.foes(u); const t = picks.filter(f => f.alive)[k] || live[k % Math.max(1, live.length)] || tgt; if (!t) return; u['_sp' + k] = { x: t.x, z: t.z }; this.ev({ t: 'vfx', kind: 'az_lance', x: t.x, z: t.z, r: R, delay: 0.55 / spd }); } });
            hits.push({ at, fn: () => { const p = u['_sp' + k]; if (!p) return; for (const f of this.foes(u)) if (Math.abs(f.x - p.x) <= R + f.rad && Math.abs(f.z - p.z) <= R + f.rad) this.deal(u, f, S.mult * (u.skillMul || 1), { skill: true }); } });
          }
          hits.push({ at: S.transformAt / spd, fn: () => { u.form = 'inanna'; u.def = INANNA; this.ev({ t: 'form', id: u.id, form: 'inanna' }); this.ev({ t: 'text', id: u.id, msg: '이난나', color: '#ffe0f0' }); } });
        } else {
          // 이난나 · 세계수의 축복: 맵 중앙에 5초간 세계수, 아군 전체 초당 공격력 80% 회복 → 아제나로 변신
          hits.push({ at: S.treeAt / spd, fn: () => {
            const tick = S.tick, heal = u.atk * (u.dmgMul || 1) * S.healPerSec * tick * (u.skillMul || 1);
            (this.zones = this.zones || []).push({ side: u.side, x: 0, z: 0, r: 999, t: S.treeDur, tick: 0, every: tick, heal });
            this.ev({ t: 'vfx', kind: 'in_tree', x: 0, z: 0, dur: S.treeDur });
          } });
          hits.push({ at: S.transformAt / spd, fn: () => { u.form = 'azena'; u.def = AZENA; this.ev({ t: 'form', id: u.id, form: 'azena' }); this.ev({ t: 'text', id: u.id, msg: '아제나', color: '#b8c8ff' }); } });
        }
      } else if (u.kind === 'federico') {
        // 신성한 광선: 공중에 떠올라 폭 5칸 광선을 맵 끝까지 3초간 (tick마다 피해)
        // 2026-10-31 3차: 적이 가장 많이 모인 곳(반경 1.5칸 안 적 수 최대)을 광선 중심선이 지나가도록 조준. 시전 중 방향 고정
        const half = S.widthCells * CELL / 2, foes = this.foes(u).filter(f => !(f.untargetT > 0));
        let aim = null, an = -1, ad = 1e9;
        for (const f of foes) {
          const near = foes.filter(o => dist(o, f) <= CELL * 1.5);
          const cx = near.reduce((a, o) => a + o.x, 0) / near.length, cz = near.reduce((a, o) => a + o.z, 0) / near.length, dd = Math.hypot(cx - u.x, cz - u.z);
          if (near.length > an || (near.length === an && dd < ad)) { an = near.length; ad = dd; aim = { x: cx, z: cz }; }
        }
        let bdx = 0, bdz = u.side === 'ally' ? -1 : 1;
        if (aim) { const l = Math.hypot(aim.x - u.x, aim.z - u.z); if (l > 0.3) { bdx = (aim.x - u.x) / l; bdz = (aim.z - u.z) / l; } }
        const ext = (o, d, B) => d > 1e-6 ? (B - o) / d : d < -1e-6 ? (-B - o) / d : 1e9; // 맵 끝까지 거리
        const B = { dx: bdx, dz: bdz, ox: u.x, oz: u.z, len: Math.max(1, Math.min(ext(u.x, bdx, BOUNDS.x), ext(u.z, bdz, BOUNDS.z))) };
        const inBeam = (f) => { const rx = f.x - B.ox, rz = f.z - B.oz; return rx * B.dx + rz * B.dz >= -0.6 && Math.abs(rx * B.dz - rz * B.dx) <= half + f.rad * 0.5; };
        u.face = Math.atan2(-B.dz, B.dx); u.faceLock = u.face;
        this.ev({ t: 'vfx', kind: 'fed_float', from: u.id, dur: S.floatDur / spd });
        u.face = Math.atan2(-B.dz, B.dx);
        hits.push({ at: S.beamFrom / spd, fn: () => {
          this.ev({ t: 'vfx', kind: 'fed_beam', from: u.id, x: B.ox, z: B.oz, dx: B.dx, dz: B.dz, len: B.len, w: half * 2, dur: S.beamDur / spd });
        } });
        const n = Math.round(S.beamDur / S.tick);
        for (let k = 0; k < n; k++) hits.push({ at: (S.beamFrom + 0.1 + k * S.tick) / spd, fn: () => {
          for (const f of this.foes(u)) if (inBeam(f)) { this.deal(u, f, S.tickMult * (u.skillMul || 1), { skill: true }); if (k % 2 === 0) this.ev({ t: 'vfx', kind: 'fed_ray_hit', to: f.id }); }
        } });
      } else if (u.kind === 'aman') {
        // 수호의 기도: 아만 주변(사거리 3칸 안)에서 아군이 가장 많이 모인 3×3칸 → 그 안 아군에게 보호막
        const half = S.areaCells * CELL / 2, near = this.friends(u).filter(f => dist(u, f) <= S.searchCells * CELL + 0.5);
        let best = { x: u.x, z: u.z }, bn = -1;
        for (const c of near) { const n = this.friends(u).filter(f => Math.abs(f.x - c.x) <= half && Math.abs(f.z - c.z) <= half).length; if (n > bn) { bn = n; best = { x: c.x, z: c.z }; } }
        hits.push({ at: S.shieldAt / spd, fn: () => {
          const v = u.atk * (u.dmgMul || 1) * S.shieldMult * (u.skillMul || 1);
          this.ev({ t: 'vfx', kind: 'am_ward', x: best.x, z: best.z, half, from: u.id });
          for (const f of this.friends(u)) if (Math.abs(f.x - best.x) <= half + f.rad * 0.5 && Math.abs(f.z - best.z) <= half + f.rad * 0.5) { this._timedShield(f, v, S.shieldDur); this.ev({ t: 'vfx', kind: 'am_shield', to: f.id }); }
        } });
      } else if (u.kind === 'neria') {
        hits.push({ at: S.healAt / spd, fn: () => {
          this.ev({ t: 'fx', kind: 'ring', x: u.x, z: u.z, r: 3.5, color: '#7ee08a' });
          for (const f of this.friends(u)) { this.heal(f, u.atk * (u.dmgMul || 1) * S.mult * (u.skillMul || 1)); this.ev({ t: 'vfx', kind: 'heal', from: u.id, to: f.id, big: true }); }
        } });
      } else if (u.kind === 'silian') {
        hits.push({ at: S.buffAt / spd, fn: () => { u.buffT = S.buffDur; this.ev({ t: 'vfx', kind: 'silian_buff', from: u.id, dur: S.buffDur }); this.ev({ t: 'text', id: u.id, msg: '검의 해방 · 8초', color: '#ffe08a' }); } });
      } else if (u.kind === 'hidaka') {
        // 도끼 회전: spinFrom부터 spinDur초 동안 tickEvery마다 주변 피해
        const R = S.radiusCells * CELL, n = Math.round(S.spinDur / S.tickEvery);
        hits.push({ at: S.spinFrom / spd, fn: () => this.ev({ t: 'vfx', kind: 'hidaka_spin', from: u.id, dur: S.spinDur / spd, r: R }) });
        for (let k = 0; k < n; k++) hits.push({ at: (S.spinFrom + k * S.tickEvery) / spd, fn: () => {
          for (const f of this.foes(u)) if (dist(f, u) <= R + f.rad) this.deal(u, f, S.tickMult * (u.skillMul || 1), { skill: true });
        } });
      } else if (u.kind === 'shana') {
        let hitList = [];
        const origin = { x: u.x, z: u.z };
        hits.push({ at: S.flashAt / spd, fn: () => {
          u.untargetT = S.flashDur; u.invulnT = Math.max(u.invulnT, S.flashDur);
          this.ev({ t: 'flash', id: u.id, dur: S.flashDur }); this.ev({ t: 'vfx', kind: 'shana_flash', from: u.id });
          this.ev({ t: 'text', id: u.id, msg: '섬광 · 지정 불가', color: '#e0c8ff' });
        } });
        hits.push({ at: S.hitAt / spd, fn: () => {
          const R = S.castRangeCells * CELL;
          hitList = this.foes(u).filter(f => dist(f, u) <= R + f.rad).sort((a, b) => dist(a, u) - dist(b, u)).slice(0, S.targets);
          if (!hitList.length) hitList = this.foes(u).sort((a, b) => dist(a, u) - dist(b, u)).slice(0, S.targets);
          for (const f of hitList) { this.ev({ t: 'vfx', kind: 'shana_hit', from: u.id, to: f.id }); this.deal(u, f, S.mult * (u.skillMul || 1), { skill: true }); }
        } });
        hits.push({ at: S.teleportAt / spd, fn: () => {
          const alive = hitList.filter(f => f.alive);
          const far = (alive.length ? alive : this.foes(u)).sort((a, b) => dist(b, origin) - dist(a, origin))[0];
          if (!far) return;
          const dx = far.x - origin.x, dz = far.z - origin.z, l = Math.hypot(dx, dz) || 1;
          u.x = far.x + dx / l * (far.rad + u.rad + 0.3); u.z = far.z + dz / l * (far.rad + u.rad + 0.3);
          u.x = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, u.x)); u.z = Math.max(-BOUNDS.z, Math.min(BOUNDS.z, u.z));
          u.focus = far; u.face = Math.atan2(-(far.z - u.z), far.x - u.x);
          this.ev({ t: 'tele', id: u.id });
        } });
      }
    }
    u.action = { kind: isSkill ? 'skill' : 'attack', t: 0, dur, spd: 1, hits };
    this.ev({ t: 'act', id: u.id, kind: isSkill ? 'skill' : 'attack', clips, dur });
  }

  // 바드 스킬: 수호의 연주(파티 보호막) → [1730] 절실한 구원(가장 체력이 낮은 아군 위치에 회복 장판) → [1770] 3회째마다 용맹의 세레나데(공격력 증가)
  _bardSkill(u, tgt, spd) {
    const D = u.def, S = D.skill, R = D.rescue, V = D.valiant;
    u.mana -= u.maxMana; this._skillShield(u);
    const clips = S.segs.map(sg => ({ clip: sg.clip, dur: sg.dur / spd }));
    let off = S.segs.reduce((a, sg) => a + sg.dur, 0);
    const hits = [];
    this.ev({ t: 'text', id: u.id, msg: S.name, color: '#ffe08a' });
    hits.push({ at: S.shieldAt / spd, fn: () => {
      const v = u.atk * (u.dmgMul || 1) * S.shieldMult * (u.skillMul || 1);
      this.ev({ t: 'vfx', kind: 'bd_protect', from: u.id });
      for (const f of this.friends(u)) { this._timedShield(f, v, S.shieldDur); this.ev({ t: 'vfx', kind: 'bd_shield', to: f.id }); }
    } });
    if (u.rescue) {
      const at0 = off;
      clips.push({ clip: R.clip, dur: R.dur / spd }); off += R.dur;
      u.rescueN = (u.rescueN || 0) + 1;
      const doValiant = u.valiant && u.rescueN % V.every === 0;
      hits.push({ at: (at0 + R.castAt) / spd, fn: () => {
        const f = this.friends(u).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (!f) return;
        const r = R.radiusCells * CELL, heal = u.atk * (u.dmgMul || 1) * R.healMult * (u.skillMul || 1);
        (this.zones = this.zones || []).push({ side: u.side, x: f.x, z: f.z, r, t: R.zoneDur, tick: 0, every: R.tick, heal });
        this.ev({ t: 'vfx', kind: 'bd_rescue', x: f.x, z: f.z, r, dur: R.zoneDur });
        this.ev({ t: 'text', id: u.id, msg: R.name, color: '#8ef0ff' });
      } });
      if (doValiant) {
        const at1 = off;
        clips.push({ clip: V.clip, dur: V.dur / spd }); off += V.dur;
        hits.push({ at: (at1 + V.castAt) / spd, fn: () => {
          this.ev({ t: 'vfx', kind: 'bd_valiant', from: u.id, dur: V.buffDur });
          this.ev({ t: 'text', id: u.id, msg: `${V.name} · 공격력 +${Math.round(V.buff * 100)}%`, color: '#ffb0f0' });
          for (const f of this.friends(u)) { f.valT = V.buffDur; f.valAmt = V.buff; this.ev({ t: 'vfx', kind: 'bd_valiant_on', to: f.id, dur: V.buffDur }); }
        } });
      }
    }
    const dur = off / spd;
    u.action = { kind: 'skill', t: 0, dur, spd: 1, hits };
    this.ev({ t: 'act', id: u.id, kind: 'skill', clips, dur });
  }
  // 지속 시간이 있는 보호막 (수호의 연주). 같은 보호막은 갱신, 만료 시 남은 만큼 제거
  _timedShield(u, v, dur) {
    if (u.side === 'ally') v *= (this.cfg.shieldMul || 1) * (1 + (u.shieldRecv || 0));
    u.shield = Math.max(0, u.shield - (u.bdShield || 0)) + v; u.bdShield = v; u.bdShieldT = dur;
    this.ev({ t: 'shield', id: u.id });
  }
  _zones(dt) {
    if (!this.zones?.length) return;
    for (const z of this.zones) {
      z.t -= dt; z.tick -= dt;
      if (z.tick <= 0) {
        z.tick += z.every;
        for (const f of this.units) if (f.alive && f.side === z.side && Math.hypot(f.x - z.x, f.z - z.z) <= z.r + f.rad) { this.heal(f, z.heal); }
      }
    }
    this.zones = this.zones.filter(z => z.t > 0);
  }

  _startAction(u, tgt) {
    const spd = this._atkSpd(u);
    // 데빌헌터 각성기는 2026-10-31 3차에 삭제 (각성기 기능 없음)
    if (u.dh) return this._dhAction(u, tgt, spd);
    if (u.def) return this._seqAction(u, tgt, spd);
    if (u.skill && u.mana >= u.maxMana) {
      u.mana = 0;
      const dur = 1.1;
      u.action = { kind: 'skill', t: 0, dur, hitAt: 0.55, spd: 1, fn: () => {
        this._skill(u, tgt, u.skill, 1);
        if (u.side === 'ally' && this.cfg.ult.has('mana')) this._skill(u, tgt, u.skill, 0.6);
        if (u.side === 'ally' && this.cfg.ult.has('swift')) u.swiftT = 3;
        if (u.side === 'ally' && this.cfg.legacies.has('shandi') && Math.random() < 0.35) { u.mana = u.maxMana; this.ev({ t: 'text', id: u.id, msg: '샨디 · 마나 충전', color: '#9ad0ff' }); }
      } };
      this.ev({ t: 'act', id: u.id, kind: 'skill', clip: u.skillClip || 'att_battle_2_01', dur });
      return;
    }
    const dur = u.int / spd;
    u.action = { kind: 'attack', t: 0, dur, hitAt: dur * 0.45, spd: 1, fn: () => {
      if (!tgt.alive) return;
      u.atkCount++;
      let mult = u.nextMul; u.nextMul = 1;
      if (u.idt === 'combo' && u.atkCount % 4 === 0) mult *= 2;
      if (u.ranged) this.ev({ t: 'proj', from: u.id, to: tgt.id, color: u.side === 'ally' ? '#9fd8ff' : '#ff9a7a' });
      this.deal(u, tgt, mult, {});
      if (u.side === 'ally' && this.cfg.legacies.has('kadan') && tgt.alive) this.deal(u, tgt, 0.7 * mult, {});
      u.mana = Math.min(u.maxMana, u.mana + 12 * (1 + (u.manaGain || 0)));
    } };
    this.ev({ t: 'act', id: u.id, kind: 'attack', clip: u.atkClip || 'att_battle_1_01', dur });
  }

  _skill(u, tgt, type, scale) {
    const m = (u.skillMul || 1) * scale;
    const foes = this.foes(u);
    const col = u.side === 'ally' ? '#7ec8ff' : '#ff7a59';
    switch (type) {
      case 'nuke':
        if (tgt.alive) this.deal(u, tgt, 3.2 * m, { skill: true });
        this.ev({ t: 'fx', kind: 'burst', x: tgt.x, z: tgt.z, r: 1.2, color: col });
        break;
      case 'multi': {
        const ts = foes.sort((a, b) => dist(u, a) - dist(u, b)).slice(0, 3);
        for (const t of ts) { this.ev({ t: 'proj', from: u.id, to: t.id, color: '#ffe08a' }); this.deal(u, t, 1.6 * m, { skill: true }); }
        break;
      }
      case 'aoe': {
        const c = tgt.alive ? tgt : u;
        this.ev({ t: 'fx', kind: 'ring', x: c.x, z: c.z, r: 2.4, color: col });
        for (const t of foes) if (dist(c, t) <= 2.4 + t.rad) this.deal(u, t, 1.9 * m, { skill: true });
        break;
      }
      case 'dash': {
        const far = foes.sort((a, b) => dist(u, b) - dist(u, a))[0];
        if (!far) break;
        const ang = Math.atan2(u.z - far.z, u.x - far.x);
        u.x = far.x + Math.cos(ang) * (far.rad + u.rad + 0.2); u.z = far.z + Math.sin(ang) * (far.rad + u.rad + 0.2);
        u.focus = far;
        this.ev({ t: 'tele', id: u.id });
        this.deal(u, far, 3.0 * m, { skill: true });
        this.ev({ t: 'fx', kind: 'burst', x: far.x, z: far.z, r: 1.0, color: col });
        break;
      }
      case 'taunt': {
        for (const t of foes) if (dist(u, t) <= 4.5) { t.taunt = u; t.tauntT = 3.5; }
        this.addShield(u, u.maxHp * 0.25 * scale);
        this.ev({ t: 'fx', kind: 'ring', x: u.x, z: u.z, r: 4.5, color: '#ffd166' });
        this.ev({ t: 'text', id: u.id, msg: '도발', color: '#ffd166' });
        break;
      }
      case 'heal': {
        const fr = this.friends(u).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (fr) { this.heal(fr, fr.maxHp * 0.22 * m); this.ev({ t: 'fx', kind: 'ring', x: fr.x, z: fr.z, r: 1.0, color: '#7ee08a' }); }
        break;
      }
      case 'shield':
        for (const f of this.friends(u)) this.addShield(f, f.maxHp * 0.12 * m);
        this.ev({ t: 'fx', kind: 'ring', x: u.x, z: u.z, r: 3.5, color: '#9ad0ff' });
        break;
      case 'buff':
        this.teamBuffT[u.side] = 6;
        this.ev({ t: 'fx', kind: 'ring', x: u.x, z: u.z, r: 3.5, color: '#ffb3e6' });
        this.ev({ t: 'text', id: u.id, msg: '아군 피해 +20%', color: '#ffb3e6' });
        break;
      case 'mirror': {
        const best = this.friends(u).filter(f => f !== u && f.skill && f.skill !== 'mirror').sort((a, b) => b.dealt - a.dealt)[0];
        const st = best ? best.skill : 'aoe';
        this.ev({ t: 'text', id: u.id, msg: `복제 · ${best ? best.name : '기본'}`, color: '#c7b3ff' });
        this._skill(u, tgt, st, 0.8 * scale);
        break;
      }
    }
  }

  _awake(u, tgt) {
    if (u.role === 'support') {
      for (const f of this.friends(u)) { this.heal(f, f.maxHp * 0.3); this.addShield(f, f.maxHp * 0.15); }
      this.ev({ t: 'fx', kind: 'ring', x: u.x, z: u.z, r: 6, color: '#fff3a0' });
      return;
    }
    const c = tgt.alive ? tgt : u;
    this.ev({ t: 'fx', kind: 'nova', x: c.x, z: c.z, r: 4, color: '#ffd166' });
    const mult = u.dh ? DH.awake.mult : 6;
    for (const t of this.foes(u)) if (dist(c, t) <= 4 + t.rad) this.deal(u, t, mult * (u.skillMul || 1), { skill: true, awake: true });
  }

  _bossTick(u, dt) {
    const p = u.pattern;
    const allies = this.foes(u);
    if (!allies.length) return;
    if (p === 'twin' || p === 'merged') this._whirl(u, dt, allies);
    if (p === 'shuheri') this._shuheri(u, dt, allies);
    if (p === 'valtan') this._valtan(u, dt, allies);
    if (p === 'willy') this._willy(u, dt, allies);
    if (p === 'spike') this._spike(u, dt, allies);
    const bigHit = (mult, msg) => {
      this.ev({ t: 'act', id: u.id, kind: 'boss', clip: u.bigClip || 'att_battle_3_01', dur: 1.4 });
      this.ev({ t: 'fx', kind: 'nova', x: u.x, z: u.z, r: 9, color: '#ff3b3b' });
      if (msg) this.ev({ t: 'banner', msg, color: '#ff6b6b' });
      for (const a of allies) this.deal(u, a, mult, { pure: true });
    };
    if (p === 'gauge' || p === 'master') {
      u.gauge += dt / (p === 'master' ? 15 : 12);
      if (u.gauge >= 1) { u.gauge = 0; bigHit(1.6, `${u.name} · 광역 각성기`); }
    }
    if (p === 'blink' || p === 'master') {
      u.patT += dt;
      if (u.patT >= (p === 'master' ? 10 : 8)) {
        u.patT = 0;
        const ranged = allies.filter(a => a.ranged);
        const t = (ranged.length ? ranged : allies).sort((a, b) => b.z - a.z)[0];
        u.x = t.x; u.z = Math.min(BOUNDS.z, t.z + t.rad + u.rad + 0.1);
        u.focus = t;
        this.ev({ t: 'tele', id: u.id });
        this.ev({ t: 'text', id: u.id, msg: '순간이동', color: '#7fe9ff' });
        this.deal(u, t, 2.0, {});
      }
    }
    if (p === 'fortress') {
      u.fortT += dt;
      if (u.fortT >= 14 && u.fortShield === 0) {
        u.fortShield = 6; u.shield += u.maxHp * 0.12; this.ev({ t: 'shield', id: u.id });
        this.ev({ t: 'banner', msg: '성채의 수호자 · 보호막을 6초 안에 깨세요', color: '#9fe08a' });
      }
      if (u.fortShield > 0) {
        u.fortShield -= dt;
        if (u.shield <= 0) { u.fortShield = 0; u.fortT = 0; this.ev({ t: 'banner', msg: '보호막 파괴!', color: '#9fe08a' }); u.stunT = 2.5; this.ev({ t: 'act', id: u.id, kind: 'stagger', dur: 2.5 }); }
        else if (u.fortShield <= 0) { u.fortShield = 0; u.fortT = 0; u.shield = 0; bigHit(2.2, '강타!'); }
      }
    }
    if (p === 'mirror') {
      u.patT += dt;
      if (u.patT >= 10) {
        u.patT = 0;
        const top = allies.slice().sort((a, b) => b.dealt - a.dealt)[0];
        this.ev({ t: 'text', id: u.id, msg: `복제 · ${top.name}`, color: '#6fb3ff' });
        this.ev({ t: 'fx', kind: 'ring', x: top.x, z: top.z, r: 2.6, color: '#6fb3ff' });
        for (const a of allies) if (dist(a, top) <= 2.6 + a.rad) this.deal(u, a, 2.0, { pure: true });
      }
    }
    if (p === 'stagger' || p === 'master') {
      u.patT2 += dt;
      const cyc = p === 'master' ? 20 : 12;
      if (!u.stag && u.patT2 >= cyc) {
        u.stag = { t: 4, need: u.maxHp * 0.08, got: 0 };
        this.ev({ t: 'banner', msg: `${u.name} · 무력화하세요! (4초)`, color: '#ffae3b' });
      }
      if (u.stag) {
        u.stag.t -= dt;
        if (u.stag.got >= u.stag.need) {
          u.stag = null; u.patT2 = 0; u.stunT = 3; u.markT = Math.max(u.markT, 3);
          this.ev({ t: 'banner', msg: '무력화 성공!', color: '#7ee08a' }); this.ev({ t: 'act', id: u.id, kind: 'stagger', dur: 3 });
        } else if (u.stag.t <= 0) {
          u.stag = null; u.patT2 = 0;
          this.ev({ t: 'act', id: u.id, kind: 'boss', clip: u.bigClip || 'att_battle_3_01', dur: 1.4 });
          this.ev({ t: 'fx', kind: 'nova', x: u.x, z: u.z, r: 10, color: '#ff2020' });
          this.ev({ t: 'banner', msg: '무력화 실패 · 전멸기', color: '#ff4040' });
          for (const a of allies) this.deal(u, a, 0, { flat: a.maxHp * 0.55, pure: true });
        }
      }
    }
  }

  addShield(u, v) { if (u.side === 'ally') v *= (this.cfg.shieldMul || 1) * (1 + (u.shieldRecv || 0)); u.shield += v; this.ev({ t: 'shield', id: u.id }); }
  // 장비 옵션: 스킬 사용 시 최대 체력 n% 보호막 4초 (중첩 없이 갱신)
  _skillShield(u) {
    if (!u.skillShield) return;
    const v = u.maxHp * u.skillShield;
    u.shield = Math.max(0, u.shield - (u.tmpShield || 0)) + v; u.tmpShield = v; u.tmpShieldT = 4;
    this.ev({ t: 'shield', id: u.id });
  }

  heal(u, v, quiet) {
    if (!u.alive) return;
    v *= (u.healMul || 1);
    const before = u.hp; u.hp = Math.min(u.maxHp, u.hp + v);
    if (!quiet && u.hp > before) this.ev({ t: 'heal', id: u.id, v: Math.round(u.hp - before) });
  }

  deal(src, tgt, mult, o) {
    if (!tgt.alive) return 0;
    if (tgt.ghost) return 0; // 유령 발탄: 피해를 받지 않음 (10초 생존)
    if (tgt.invulnT > 0) { this.ev({ t: 'text', id: tgt.id, msg: '무적', color: '#ffffff' }); return 0; }
    const cfg = this.cfg;
    let crit = false, v;
    if (o.flat) v = o.flat;
    else {
      crit = Math.random() < (src.crit || 0);
      v = src.atk * mult * (crit ? src.critDmg : 1) * rnd(0.92, 1.08);
      v *= (src.dmgMul || 1);
      if (o.skill) v *= 1 + (src.skillDmg || 0);
      if (o.awake) v *= 1 + (src.awakeDmg || 0);
      if (tgt.boss) v *= 1 + (src.bossDmg || 0);
      if (src.side === 'ally' && cfg.ult.has('chaos')) v *= 1 + 0.6 * (1 - src.hp / src.maxHp);
      if (src.pattern === 'clown') v *= 1 + 0.6 * (1 - src.hp / src.maxHp);
      if (src.idt === 'stealth' && tgt.hp < tgt.maxHp * 0.5) v *= 1.25;
      if (src.side === 'ally' && cfg.legacies.has('ninav') && src.shield > 0) v *= 1.15;
      if (src.side === 'ally' && cfg.shieldAtk && src.shield > 0) v *= 1 + cfg.shieldAtk; // 종 고유 효과 Ⅲ
      if (this.teamBuffT[src.side] > 0) v *= 1.2;
      if (src.valT > 0) v *= 1 + (src.valAmt || 0);
      if (src.side === 'enemy' && this.enraged) v *= 2;
      if (src.ghost) v *= src.vdef.ghost.dmg;
      if (src.pattern === 'trio') v *= 1 + 0.2 * this.units.filter(x => x !== src && x.alive && x.pattern === 'trio').length;
    }
    v *= tgt.takenMul || 1;
    if (tgt.markT > 0) v *= 1.4;
    if (tgt.side === 'ally' && this.res.has('horn') && this.t < 5) v *= 0.85; // 돌격 나팔
    if (src.maskT > 0 && src.maskT > this.t - 5) v *= 1.4; // 그림자 습격 (maskT = 발동 시각)
    v = Math.max(1, Math.round(v));
    if (crit && src.pattern === 'critStack') { src.nextMul = 1 + 0.5 * Math.min(6, (src.critStacks = (src.critStacks || 0) + 1)); this.ev({ t: 'text', id: src.id, msg: `치명 중첩 ${src.critStacks}`, color: '#ffd060' }); }
    else if (src.pattern === 'critStack' && !crit) src.critStacks = 0;

    // 라하르트 수호의 창: 범위 안 아군이 받는 피해를 라하르트가 대신 받고 -80%
    const GD = this.guard;
    if (GD && tgt.side === 'ally' && GD.u.alive && this.t < GD.until && !o.pure) {
      if (tgt === GD.u || (Math.abs(tgt.x - GD.x) <= GD.half && Math.abs(tgt.z - GD.z) <= GD.half)) {
        GD.stored += v; tgt = GD.u; v = Math.max(1, Math.round(v * (1 - GD.reduce)));
      }
    }
    if (tgt.side === 'ally' && tgt.shield > 0 && cfg.shieldTaken) { v = Math.max(1, Math.round(v * (1 - cfg.shieldTaken))); } // 종 고유 효과 Ⅱ
    let left = v;
    if (tgt.shield > 0) { const a = Math.min(tgt.shield, left); tgt.shield -= a; left -= a; }
    if (tgt.shared) {
      // 체력 공유 보스: 공유 풀에서 깎고 두 개체 체력을 맞춘다
      const S = tgt.shared; S.hp -= left;
      for (const o of this.units) if (o.shared === S && o.alive) o.hp = S.hp;
      if (!S.merged && S.hp > 0 && S.hp < S.maxHp * S.merge.at) this._merge(S);
    } else tgt.hp -= left;
    src.dealt = (src.dealt || 0) + v; if (src.mag) src.dealtM = (src.dealtM || 0) + v; tgt.taken = (tgt.taken || 0) + v; // 피해량 미터 (마법 피해는 따로 집계 → 미터에서 파랑)
    if (src.lifesteal && src.alive && src.hp > 0) this.heal(src, v * src.lifesteal, true); // 장신구: 생명력 흡수
    if (tgt.stag) tgt.stag.got += v;
    this.ev({ t: 'dmg', id: tgt.id, v, crit, side: tgt.side, mag: !!src.mag });
    if (!tgt.def && !tgt.noMana) tgt.mana = Math.min(tgt.maxMana || 100, (tgt.mana || 0) + 4); // 클래스·NPC는 기본 공격으로만 마나 획득

    // 반사 (성채의 수호자)
    if (tgt.pattern === 'fortress' && !o.reflect && src.id > 0 && src.alive) this.deal(tgt, src, 0, { flat: v * 0.15, reflect: true, pure: true });
    // 주화 강탈 (금화의 군주)
    if (src.pattern === 'thief' && cfg.coins) {
      const s = Math.min(cfg.coins.v, 6); if (s > 0) { cfg.coins.v -= s; this.stolen += s; this.ev({ t: 'text', id: tgt.id, msg: `재화 -${s}`, color: '#ffd166' }); }
    }
    // 니나브
    if (tgt.side === 'ally' && cfg.legacies.has('ninav') && tgt.ninavCd <= 0 && tgt.alive) { tgt.ninavCd = 3; tgt.shield += tgt.maxHp * 0.04; }
    // 급소 해부
    if (crit && src.side === 'ally' && cfg.ult.has('crit') && !o.extra && tgt.hp > 0) this.deal(src, tgt, 0.3, { extra: true });

    if (tgt.shared && tgt.shared.hp <= 0) { for (const o of this.units) if (o.shared === tgt.shared && o.alive) this._kill(o); return v; }
    if (tgt.side === 'ally' && this.res.has('censer') && !this.resUsed.censer && tgt.hp > 0 && tgt.hp < tgt.maxHp * 0.4) { // 정화의 향
      this.resUsed.censer = true; for (const a of this.friends(tgt)) this.heal(a, a.maxHp * 0.12);
      this.ev({ t: 'banner', msg: '공명 · 정화의 향', color: '#8fd3a8' });
    }
    // 비추는 거울(공명): 처치한 아군 마나 +N, 한 번의 공격(행동)으로 얻는 양은 N×3까지
    if (tgt.hp <= 0 && tgt.side === 'enemy' && src.side === 'ally' && src.id > 0 && this.res.has('mirror') && cfg.mirrorKill && !src.noMana && src.alive) {
      const N = cfg.mirrorKill, act = src.action || null;
      if (src._kmAct !== act) { src._kmAct = act; src._kmGot = 0; }
      const g = Math.min(N, N * 3 - src._kmGot);
      if (g > 0) { src._kmGot += g; src.mana = Math.min(src.maxMana, (src.mana || 0) + g); this.ev({ t: 'text', id: src.id, msg: `거울 · 마나 +${g}`, color: '#c9c9ff' }); }
    }
    if (tgt.hp <= 0 && tgt.side === 'enemy' && src.side === 'ally' && src.id > 0 && this.res.has('mask') && !this.resUsed.mask) { // 그림자 습격
      this.resUsed.mask = true; src.maskT = this.t; this.ev({ t: 'text', id: src.id, msg: '그림자 습격 · 피해 +40%', color: '#b59bff' });
    }
    if (tgt.hp <= 0) {
      if (tgt.pattern === 'valtan' && !tgt.ghostUsed && tgt.vdef?.ghost) { this._valtanGhost(tgt); return v; }
      if (tgt.pattern === 'clown' && !tgt.clownUsed) {
        tgt.clownUsed = true; tgt.hp = 1; tgt.invulnT = 5;
        this.ev({ t: 'banner', msg: '피의 광대 · 5초 무적', color: '#ff4d5e' });
      } else this._kill(tgt);
    }
    return v;
  }

  // 회오리 공격: 가장 가까운 적을 쫓아가며 회전, 주변에 지속 피해. 포식자는 회전 중 4방향 칼날 3회
  _whirl(u, dt, allies) {
    const merged = u.pattern === 'merged', W = merged ? WW.merged : WW.twin;
    if (u.wwT === undefined) u.wwT = W.cd - W.first; // 첫 시전: 전투 시작 first초 (두 마리 동시)
    if (!u.ww) {
      u.wwT += dt;
      if (u.wwT >= W.cd) {
        // 시전 시각이 되면 하던 행동을 끊고 바로 회오리 (두 마리가 같은 시각에 시작해 같이 끝나므로 계속 동시에 쓴다)
        if (u.action) { u.action = null; this.ev({ t: 'act', id: u.id, kind: 'cancel' }); }
        u.wwT = 0;
        u.ww = { t: 0, tick: 0, volley: 0, base: Math.random() * Math.PI * 2 };
        // 회오리 색 = 보스 색 (붉은 늑대 = 붉은색, 푸른 늑대 = 푸른색, 합체한 포식자 = 보라색)
        const color = merged ? 'purple' : u.model === 'Wolf_Blue' ? 'blue' : 'red';
        this.ev({ t: 'whirl', id: u.id, on: true, color, r: W.radius });
        this.ev({ t: 'text', id: u.id, msg: '회오리 공격', color: { red: '#ff7a6a', blue: '#7fb8ff', purple: '#c99bff' }[color] });
      }
      return;
    }
    const w = u.ww; w.t += dt;
    // 가장 가까운 적 추적
    let tgt = null, bd = 1e9;
    for (const a of allies) { if (a.untargetT > 0) continue; const d = dist(u, a); if (d < bd) { bd = d; tgt = a; } }
    if (tgt && bd > 0.6) {
      const sp = W.speed * dt * (this.enraged ? 1.3 : 1);
      u.x += (tgt.x - u.x) / bd * Math.min(sp, bd - 0.5); u.z += (tgt.z - u.z) / bd * Math.min(sp, bd - 0.5);
      u.x = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, u.x)); u.z = Math.max(-BOUNDS.z, Math.min(BOUNDS.z, u.z));
      u.face = Math.atan2(-(tgt.z - u.z), tgt.x - u.x);
    }
    // 두 회오리가 한곳에 겹치지 않게 서로 밀어낸다 (붉은색·푸른색이 섞여 보이지 않도록)
    for (const o of this.units) {
      if (o === u || !o.alive || !o.ww || o.shared !== u.shared) continue;
      const d = dist(u, o), m = 3.0;
      if (d < m) { const k = (m - d) * 0.5 * Math.min(1, dt * 6) / (d || 1); const dx = d ? u.x - o.x : 1, dz = d ? u.z - o.z : 0; u.x += dx * k; u.z += dz * k; }
    }
    // 회전 판정
    w.tick += dt;
    if (w.tick >= W.tickEvery) { w.tick = 0; for (const a of allies) if (dist(u, a) <= W.radius + a.rad) this.deal(u, a, W.tickMult, {}); }
    // 포식자: 칼날 3회 × 4방향 (회차마다 45°씩 돌아가는 규칙)
    if (merged && w.volley < WW.blade.times.length && w.t >= WW.blade.times[w.volley]) {
      const off = w.base + w.volley * Math.PI / 4;
      this.blades = this.blades || [];
      for (let k = 0; k < 4; k++) {
        const ang = off + k * Math.PI / 2, dx = Math.cos(ang), dz = Math.sin(ang);
        this.blades.push({ src: u, x: u.x, z: u.z, dx, dz, dist: 0, max: WW.blade.range, speed: WW.blade.speed, hit: new Set() });
        this.ev({ t: 'vfx', kind: 'blade', x: u.x, z: u.z, dx, dz, speed: WW.blade.speed, max: WW.blade.range });
      }
      w.volley++;
    }
    if (w.t >= W.dur) { u.ww = null; this.ev({ t: 'whirl', id: u.id, on: false }); }
  }

  // 정예 보스 슈헤리트: 돌진 연속 베기(가장 먼 적), 체력 50% 이하에서 어둠의 주문 1회
  _shuheri(u, dt, allies) {
    const D = u.edef; if (u.action) return;
    if (!u.spellUsed && u.hp <= u.maxHp * D.spell.at) {
      u.spellUsed = true; const S = D.spell;
      u.action = { kind: 'boss', t: 0, dur: S.dur, spd: 1, hits: [{ at: S.hitAt, fn: () => {
        this.ev({ t: 'fx', kind: 'nova', x: u.x, z: u.z, r: 9, color: '#9b5cff' });
        for (const a of this.foes(u)) { this.deal(u, a, S.mult, {}); this.ev({ t: 'fx', kind: 'burst', x: a.x, z: a.z, r: 0.9, color: '#9b5cff' }); }
      } }] };
      this.ev({ t: 'act', id: u.id, kind: 'boss', clip: S.clip, dur: S.dur });
      this.ev({ t: 'banner', msg: '슈헤리트 · 어둠의 주문', color: '#c99bff' });
      return;
    }
    // 하늘의 검: 아군 위치에 붉은 장판 표시 → 일정 시간 뒤 검이 떨어져 범위 피해
    const W = D.swords;
    if (u.swT === undefined) u.swT = W.cd - W.first;
    u.swT += dt;
    if (u.swT >= W.cd) {
      u.swT = 0;
      // 전장 무작위 지점 W.count곳. 첫 지점은 무작위 아군 위치라 최소 1명은 반드시 맞는다
      const lucky = allies[Math.floor(Math.random() * allies.length)];
      const spots = [{ x: lucky.x, z: lucky.z }];
      for (let tries = 0; spots.length < W.count && tries < 200; tries++) {
        const p = { x: rnd(-BOUNDS.x + 1, BOUNDS.x - 1), z: rnd(-BOUNDS.z + 1, BOUNDS.z - 1) };
        if (spots.every(o => dist(o, p) >= W.radius * 1.4)) spots.push(p);
      }
      const hits = [{ at: W.castAt, fn: () => {
        for (const sp of spots) this.ev({ t: 'vfx', kind: 'shu_mark', x: sp.x, z: sp.z, r: W.radius, impactIn: W.delay });
        this.ev({ t: 'text', id: u.id, msg: '하늘의 검', color: '#ff7a6a' });
      } }, { at: W.castAt + W.delay, fn: () => {
        for (const sp of spots) for (const a of this.foes(u)) if (dist(a, sp) <= W.radius + a.rad) this.deal(u, a, W.mult, {});
      } }];
      u.action = { kind: 'boss', t: 0, dur: Math.max(W.dur, W.castAt + W.delay + 0.1), spd: 1, hits };
      this.ev({ t: 'act', id: u.id, kind: 'boss', clip: W.clip, dur: W.dur });
      return;
    }
    const A = D.dash;
    if (u.dashT === undefined) u.dashT = A.cd - A.first;
    u.dashT += dt;
    if (u.dashT < A.cd) return;
    u.dashT = 0;
    const far = allies.filter(a => !(a.untargetT > 0)).sort((a, b) => dist(u, b) - dist(u, a))[0]; if (!far) return;
    const hits = [{ at: 0.35, fn: () => { // 대상 앞으로 순간 접근
      if (!far.alive) return;
      const dx = u.x - far.x, dz = u.z - far.z, l = Math.hypot(dx, dz) || 1;
      u.x = far.x + dx / l * (far.rad + u.rad + 0.2); u.z = far.z + dz / l * (far.rad + u.rad + 0.2);
      u.face = Math.atan2(-(far.z - u.z), far.x - u.x); u.focus = far;
      this.ev({ t: 'tele', id: u.id }); this.ev({ t: 'text', id: u.id, msg: '돌진 베기', color: '#ff9a8a' });
    } }];
    for (const [at, m] of A.hits) hits.push({ at, fn: () => {
      this.ev({ t: 'fx', kind: 'ring', x: u.x, z: u.z, r: A.radius, color: '#ff5a4a' });
      for (const a of this.foes(u)) if (dist(a, u) <= A.radius + a.rad) this.deal(u, a, m, {});
    } });
    u.action = { kind: 'boss', t: 0, dur: A.dur, spd: 1, hits };
    this.ev({ t: 'act', id: u.id, kind: 'boss', clip: A.clip, dur: A.dur });
  }

  // ───────── 휠윈드 (공통): 가장 가까운 적을 쫓으며 회전, 3×3칸(half) 지속 피해 ─────────
  _spinStart(u, o) {
    if (u.action) { u.action = null; this.ev({ t: 'act', id: u.id, kind: 'cancel' }); }
    u.sw = { t: 0, tick: 0, ...o };
    this.ev({ t: 'spin', id: u.id, on: true, half: o.half, color: o.color || 'red', clip: o.clip, startClip: o.startClip });
  }
  _spinTick(u, dt) {
    const w = u.sw; w.t += dt;
    let tgt = null, bd = 1e9;
    for (const a of this.foes(u)) { if (a.untargetT > 0) continue; const d = dist(u, a); if (d < bd) { bd = d; tgt = a; } }
    if (tgt && bd > 0.5) {
      const sp = w.speed * dt;
      u.x += (tgt.x - u.x) / bd * Math.min(sp, bd - 0.4); u.z += (tgt.z - u.z) / bd * Math.min(sp, bd - 0.4);
      u.x = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, u.x)); u.z = Math.max(-BOUNDS.z, Math.min(BOUNDS.z, u.z));
    }
    w.tick += dt;
    if (w.tick >= w.tickEvery) { w.tick -= w.tickEvery; for (const a of this.foes(u)) if (Math.abs(a.x - u.x) <= w.half + a.rad && Math.abs(a.z - u.z) <= w.half + a.rad) this.deal(u, a, w.mult, {}); }
    if (w.t >= w.dur) { u.sw = null; this.ev({ t: 'spin', id: u.id, on: false, endClip: w.endClip }); }
  }

  // ───────── 2층 보스 발탄 ─────────
  _valtan(u, dt, allies) {
    const V = u.vdef;
    if (u.ghost) { // 유령 발탄: 10초 버티면 소멸
      u.ghostT -= dt;
      if (u.ghostT <= 0) { u.ghost = false; u.sw = null; this.ev({ t: 'spin', id: u.id, on: false }); this.ev({ t: 'banner', msg: '유령 발탄 소멸', color: '#9ff0ff' }); this._kill(u); return; }
    }
    if (u.vT === undefined) { u.vT = V.gap - V.first; u.vI = 0; }
    if (u.sw || (u.action && u.action.kind === 'boss')) return; // 패턴 진행 중에는 타이머 정지
    u.vT += dt; if (u.vT < V.gap || u.action) return;          // 기본 공격이 끝나면 바로 패턴
    u.vT = 0; const kind = V.order[u.vI++ % V.order.length];
    if (kind === 'charge') { u.chargeUsed = new Set(); this._valtanCharge(u, V.charge.times); }
    else if (kind === 'whirl') {
      const W = V.whirl;
      if (!this.wallsDown && V.ghost) { this.wallsDown = true; this.ev({ t: 'vfx', kind: 'vt_walls' }); this.ev({ t: 'banner', msg: '보스룸 외벽이 무너집니다', color: '#ff9a7a' }); }
      this.ev({ t: 'text', id: u.id, msg: '휠윈드', color: '#ff7a6a' });
      this._spinStart(u, { dur: W.dur, speed: W.speed, half: W.half * CELL, tickEvery: W.tickEvery, mult: W.tickMult, color: u.ghost ? 'teal' : 'red', startClip: 'att_battle_6_01_start', clip: 'att_battle_6_01_loop', endClip: 'att_battle_6_01_end' }); // 원본 발탄 회전 모션
    } else this._valtanJump(u);
  }
  // 돌진: 가장 먼 적(이번 패턴에서 아직 노리지 않은 적)에게 돌진해 관통, 대상 뒤로 약 2칸(맵 안에서 최대한)까지 지나간다. 부딪친 적은 1칸 밀리며 경직
  _valtanCharge(u, left) {
    const C = u.vdef.charge, foes = this.foes(u).filter(a => !(a.untargetT > 0));
    if (!foes.length) return;
    const cand = foes.filter(a => !u.chargeUsed.has(a.id)), pool = cand.length ? cand : foes;
    const T = pool.sort((a, b) => dist(u, b) - dist(u, a))[0]; u.chargeUsed.add(T.id);
    let dx = T.x - u.x, dz = T.z - u.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    // 대상 뒤로 past칸, 맵 밖으로 나가지 않는 선에서 최대한
    let far = l + C.past * CELL; const lim = (p, d, b) => d > 0 ? (b - p) / d : d < 0 ? (-b - p) / d : 1e9;
    far = Math.max(0.5, Math.min(far, lim(u.x, dx, BOUNDS.x - u.rad), lim(u.z, dz, BOUNDS.z - u.rad)));
    const sx = u.x, sz = u.z, ex = sx + dx * far, ez = sz + dz * far, W = C.width * CELL / 2, spd = this._atkSpd(u);
    const wind = C.windup / spd, dash = C.dashDur, total = wind + dash + C.recover / spd, hit = new Set();
    u.face = Math.atan2(-dz, dx);
    this.ev({ t: 'vfx', kind: 'vt_charge_mark', x0: sx, z0: sz, x1: ex, z1: ez, w: W * 2, dur: wind, ghost: !!u.ghost });
    this.ev({ t: 'text', id: u.id, msg: '돌진', color: '#ff7a6a' });
    u.action = { kind: 'boss', t: 0, dur: total, spd: 1, hits: [{ at: wind, fn: () => this.ev({ t: 'vfx', kind: 'vt_dash', from: u.id, x0: sx, z0: sz, x1: ex, z1: ez, dur: dash, ghost: !!u.ghost }) }],
      update: (t) => {
        if (t < wind) return;
        const k = Math.min(1, (t - wind) / dash); u.x = sx + (ex - sx) * k; u.z = sz + (ez - sz) * k;
        for (const a of this.foes(u)) {
          if (hit.has(a.id)) continue;
          const rx = a.x - sx, rz = a.z - sz, along = rx * dx + rz * dz, side = Math.abs(rx * dz - rz * dx);
          if (along > far * k + u.rad || along < -0.5 || side > W + a.rad) continue;
          hit.add(a.id); this.deal(u, a, C.mult, {});
          if (a.alive) { a.knock = { dx, dz, left: C.knock * CELL, v: C.knock * CELL / 0.3 }; a.stunT = Math.max(a.stunT, C.stun); if (a.action) a.action = null; this.ev({ t: 'act', id: a.id, kind: 'stun', dur: C.stun }); this.ev({ t: 'text', id: a.id, msg: '경직', color: '#ffb0a0' }); }
        }
      },
      onEnd: () => { if (left > 1 && u.alive) this._valtanCharge(u, left - 1); } };
    this.ev({ t: 'act', id: u.id, kind: 'boss', clip: C.clip, dur: total + 0.4 });
  }
  // 사라졌다 내리찍기: 공중으로 올라가 사라진 뒤 가장 먼 적에게 내리찍는다
  _valtanJump(u) {
    const J = u.vdef.jump, spd = this._atkSpd(u), foes = this.foes(u).filter(a => !(a.untargetT > 0));
    if (!foes.length) return;
    const T = foes.sort((a, b) => dist(u, b) - dist(u, a))[0]; let spot = null; const R = J.radiusCells * CELL;
    u.action = { kind: 'boss', t: 0, dur: J.dur / spd, spd: 1, hits: [
      { at: J.riseAt / spd, fn: () => { u.untargetT = (J.landAt - J.riseAt) / spd; this.ev({ t: 'vfx', kind: 'vt_rise', from: u.id }); this.ev({ t: 'text', id: u.id, msg: '사라졌다 내리찍기', color: '#ff7a6a' }); } },
      { at: J.markAt / spd, fn: () => { const t = T.alive ? T : (this.foes(u)[0] || T); spot = { x: t.x, z: t.z }; this.ev({ t: 'vfx', kind: 'vt_slam_mark', x: spot.x, z: spot.z, r: R, impactIn: (J.landAt - J.markAt) / spd, ghost: !!u.ghost }); } },
      { at: J.landAt / spd, fn: () => {
        if (!spot) return; u.x = Math.max(-BOUNDS.x, Math.min(BOUNDS.x, spot.x)); u.z = Math.max(-BOUNDS.z, Math.min(BOUNDS.z, spot.z));
        this.ev({ t: 'vfx', kind: 'vt_slam', from: u.id, x: u.x, z: u.z, r: R, ghost: !!u.ghost });
        for (const a of this.foes(u)) if (dist(a, u) <= R + a.rad) this.deal(u, a, J.mult, {});
      } }] };
    this.ev({ t: 'act', id: u.id, kind: 'boss', clip: J.clip, dur: J.dur / spd });
  }
  // 발탄이 쓰러지면 유령 발탄으로 부활: 10초간 피해를 받지 않고 공격 속도·피해 2배. 그동안 전멸하면 패배
  _valtanGhost(u) {
    const G = u.vdef.ghost;
    u.ghostUsed = true; u.ghost = true; u.ghostT = G.dur; u.hp = u.maxHp; u.action = null; u.sw = null; u.stunT = 0; u.stag = null;
    u.name = '유령 발탄'; u.vT = u.vdef.gap - 2;
    this.ev({ t: 'act', id: u.id, kind: 'cancel' }); this.ev({ t: 'spin', id: u.id, on: false });
    this.ev({ t: 'ghost', id: u.id });
    this.ev({ t: 'banner', msg: '유령 발탄 · 10초간 버티세요 (공격 속도·피해 2배)', color: '#7ff0ff' });
  }

  // ───────── 2층 정예 갈기 가시팔: 내려찍기(붉은 원 예고) · 휘두르기(주변) ─────────
  _spike(u, dt, allies) {
    const D = u.edef; if (u.action && u.action.kind === 'boss') return;
    u.slT = (u.slT ?? (D.slam.cd - D.slam.first)) + dt; u.swT2 = (u.swT2 ?? (D.sweep.cd - D.sweep.first)) + dt;
    if (u.action) return;
    if (u.slT >= D.slam.cd) {
      u.slT = 0; const S = D.slam, R = S.radiusCells * CELL;
      const T = allies.filter(a => !(a.untargetT > 0)).sort((a, b) => dist(u, b) - dist(u, a))[0]; if (!T) return;
      let spot = null;
      u.action = { kind: 'boss', t: 0, dur: S.dur, spd: 1, hits: [
        { at: S.markAt, fn: () => { spot = { x: T.x, z: T.z }; u.face = Math.atan2(-(spot.z - u.z), spot.x - u.x); this.ev({ t: 'vfx', kind: 'vt_slam_mark', x: spot.x, z: spot.z, r: R, impactIn: S.hitAt - S.markAt }); this.ev({ t: 'text', id: u.id, msg: '내려찍기', color: '#ff9a7a' }); } },
        { at: S.hitAt - 0.15, fn: () => { if (!spot) return; const dx = spot.x - u.x, dz = spot.z - u.z, l = Math.hypot(dx, dz) || 1, k = Math.max(0, l - R * 0.6) / l; u.x += dx * k; u.z += dz * k; this.ev({ t: 'tele', id: u.id }); } },
        { at: S.hitAt, fn: () => { if (!spot) return; this.ev({ t: 'vfx', kind: 'vt_slam', from: -1, x: spot.x, z: spot.z, r: R }); for (const a of this.foes(u)) if (dist(a, spot) <= R + a.rad) this.deal(u, a, S.mult, {}); } }] };
      this.ev({ t: 'act', id: u.id, kind: 'boss', clip: S.clip, dur: S.dur });
      return;
    }
    if (u.swT2 >= D.sweep.cd) {
      u.swT2 = 0; const S = D.sweep, R = S.radiusCells * CELL;
      u.action = { kind: 'boss', t: 0, dur: S.dur, spd: 1, hits: [{ at: S.hitAt, fn: () => {
        this.ev({ t: 'fx', kind: 'ring', x: u.x, z: u.z, r: R, color: '#ff7a4a' }); this.ev({ t: 'vfx', kind: 'vt_dust', from: u.id });
        for (const a of this.foes(u)) if (dist(a, u) <= R + a.rad) this.deal(u, a, S.mult, {});
      } }] };
      this.ev({ t: 'act', id: u.id, kind: 'boss', clip: S.clip, dur: S.dur });
      this.ev({ t: 'text', id: u.id, msg: '휩쓸기', color: '#ff9a7a' });
    }
  }

  // ───────── 1층 정예 윌리윌리: 5초마다 호박단 병사 소환, 휠윈드 때 병사도 함께 ─────────
  _willy(u, dt, allies) {
    const D = u.edef;
    u.smT = (u.smT ?? (D.summon.every - D.summon.first)) + dt;
    if (u.smT >= D.summon.every) {
      u.smT = 0;
      const live = this.units.filter(o => o.alive && o.mkey === 'pumpkin').length;
      if (live < D.summon.max && this.cfg.summonPumpkin) {
        const a = this.cfg.summonPumpkin(); a.id = this.nextId++;
        const ang = Math.random() * Math.PI * 2; a.x = Math.max(-BOUNDS.x + 0.6, Math.min(BOUNDS.x - 0.6, u.x + Math.cos(ang) * 1.6)); a.z = Math.max(-BOUNDS.z + 0.6, Math.min(BOUNDS.z - 0.6, u.z + Math.sin(ang) * 1.6));
        this._init(a); a.alive = true; this.units.push(a); this.ev({ t: 'spawn', id: a.id }); this.ev({ t: 'vfx', kind: 'pk_summon', x: a.x, z: a.z });
        if (u.sw) this._spinStart(a, { dur: u.sw.dur - u.sw.t, tickEvery: u.sw.tickEvery, mult: D.whirl.soldierMult, half: CELL * 0.75, speed: a.speed, color: 'orange', clip: null });
      }
    }
    if (u.sw || (u.action && u.action.kind === 'boss')) return;
    const W = D.whirl;
    u.wlT = (u.wlT ?? (W.cd - W.first)) + dt;
    if (u.wlT < W.cd) return;
    u.wlT = 0;
    this.ev({ t: 'text', id: u.id, msg: '휠윈드', color: '#ffb36b' });
    this._spinStart(u, { dur: W.dur, speed: W.speed, half: W.half * CELL, tickEvery: W.tickEvery, mult: W.tickMult, color: 'orange', clip: W.loopClip, startClip: W.startClip, endClip: W.endClip });
    for (const o of this.units) if (o.alive && o.mkey === 'pumpkin' && !o.sw) this._spinStart(o, { dur: W.dur, speed: o.speed, half: CELL * 0.75, tickEvery: W.tickEvery, mult: W.soldierMult, color: 'orange', clip: null });
  }

  // 루가루 + 루카스 합체 → 검은 산의 포식자
  _merge(S) {
    S.merged = true;
    const twins = this.units.filter(o => o.shared === S && o.alive);
    if (!twins.length) return;
    const keep = twins[0], M = S.merge;
    const mx = twins.reduce((a, o) => a + o.x, 0) / twins.length, mz = twins.reduce((a, o) => a + o.z, 0) / twins.length;
    for (const o of twins.slice(1)) { o.alive = false; o.dead = true; o.action = null; this.ev({ t: 'vanish', id: o.id, x: mx, z: mz }); }
    Object.assign(keep, { name: M.name, desc: M.desc, tint: M.tint, h: M.h, atk: M.atk, rad: 1.4, x: mx, z: mz, action: null, pattern: 'merged' });
    keep.stunT = 0;
    for (const o of twins) if (o.ww) { o.ww = null; this.ev({ t: 'whirl', id: o.id, on: false }); }
    keep.wwT = WW.merged.cd; // 합체 직후 즉시 회오리
    this.ev({ t: 'transform', id: keep.id, name: M.name, tint: M.tint, h: M.h });
    this.ev({ t: 'banner', msg: `합체! ${M.name}`, color: '#c99bff' });
  }

  _kill(u) {
    if (u.ww) { u.ww = null; this.ev({ t: 'whirl', id: u.id, on: false }); }
    if (u.sw) { u.sw = null; this.ev({ t: 'spin', id: u.id, on: false }); }
    u.alive = false; u.hp = 0; u.action = null; u.shield = 0; u.dead = true;
    this.ev({ t: 'die', id: u.id });
    if (u.side === 'ally' && this.cfg.legacies.has('bahuntur') && !this.bahunturUsed) {
      this.bahunturUsed = true;
      u.reviveAt = this.t + 1.2;
      this._pendingRevive = u;
    }
    if (u.pattern === 'thief' && this.cfg.coins) { this.cfg.coins.v += this.stolen + 60; this.ev({ t: 'banner', msg: `빼앗긴 재화 ${this.stolen} + 보너스 60 회수`, color: '#ffd166' }); }
  }

  // 부활 처리 (step 뒤에 호출)
  post() {
    const u = this._pendingRevive;
    if (u && this.t >= u.reviveAt && !this.over) {
      this._pendingRevive = null;
      u.alive = true; u.dead = false; u.hp = u.maxHp * 0.5;
      this.ev({ t: 'revive', id: u.id });
      this.ev({ t: 'banner', msg: `바훈투르의 유산 · ${u.name} 부활`, color: '#ffd166' });
    }
  }
}

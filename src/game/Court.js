// The Court manager: tracks the relationship with all 1,024 court vampires, renders distant ones as
// an instanced crowd, materialises nearby ones into full animated models, and runs the
// befriend / duel / renounce flows and the follower allies.
import * as THREE from 'three';
import { getRoster, COURT_SIZE, ACCEPT_LINES, DUEL_LINES, RENOUNCE_LINES } from './VampireRoster.js';
import { POWERS } from './Powers.js';
import { CourtVampire } from '../entities/CourtVampire.js';
import { createCrowdGeometry } from '../entities/models/VampireModels.js';
import { pick, seeded } from '../core/utils.js';

export const MAX_FOLLOWERS = 3;
const FULL_RADIUS = 24;
const MAX_FULL = 14;
const RELEASE_RADIUS = 30;

export class Court {
  constructor(game) {
    this.game = game;
    this.roster = getRoster();
    this.state = new Map(); // id -> { s: 'neutral'|'ally'|'hostile'|'dead', follow: bool, downedT }
    this.followers = []; // ids (order = formation slot)
    this.entities = new Map(); // id -> CourtVampire (materialised)
    this.slots = null; // castle layout positions
    this.crowd = null;
    this.buildQueue = [];
    this.met = new Set();
  }

  // ── state ──────────────────────────────────────────────────────────────────────────────────────
  get(id) {
    return this.state.get(id) ?? { s: 'neutral', follow: false };
  }

  set(id, patch) {
    const cur = { ...this.get(id), ...patch };
    this.state.set(id, cur);
    return cur;
  }

  counts() {
    let allies = 0, dead = 0, hostile = 0;
    for (const v of this.state.values()) {
      if (v.s === 'ally') allies++;
      else if (v.s === 'dead') dead++;
      else if (v.s === 'hostile') hostile++;
    }
    return { total: COURT_SIZE, allies, dead, hostile, alive: COURT_SIZE - dead, met: this.met.size, following: this.followers.length };
  }

  allyList() {
    const out = [];
    for (const [id, v] of this.state) if (v.s === 'ally') out.push({ ...this.roster[id], follow: this.followers.includes(id), downed: (v.downedT ?? 0) > 0 });
    return out;
  }

  serialize() {
    const st = {};
    for (const [id, v] of this.state) st[id] = { s: v.s, f: this.followers.includes(id) ? 1 : 0 };
    return { state: st, followers: [...this.followers], met: [...this.met] };
  }

  load(data) {
    this.state.clear();
    this.followers = [];
    this.met = new Set(data?.met ?? []);
    if (data?.state) {
      for (const k of Object.keys(data.state)) {
        const id = +k;
        if (id >= 0 && id < COURT_SIZE) this.state.set(id, { s: data.state[k].s, follow: false });
      }
    }
    for (const id of data?.followers ?? []) if (this.get(id).s === 'ally' && this.followers.length < MAX_FOLLOWERS) this.followers.push(id);
  }

  // ── area lifecycle ─────────────────────────────────────────────────────────────────────────────
  /** Called after an area is built (and after the player is placed). */
  onAreaEnter(area) {
    this.entities.clear();
    this.buildQueue.length = 0;
    this.slots = area.courtSlots ?? null;
    this.slotById = this.slots ? new Map(this.slots.map((sl) => [sl.id, sl])) : null;
    this.crowd = null;
    if (this.slots) this.buildCrowd(area);
    // followers come along wherever the player goes
    const p = this.game.player;
    this.followers.forEach((id, i) => {
      if ((this.get(id).downedT ?? 0) > 0) return;
      this.spawnFollower(id, i, p.position);
    });
  }

  spawnFollower(id, slot, near) {
    const g = this.game;
    const a = g.player.yaw + Math.PI + (slot - 1) * 0.7;
    const x = near.x + Math.sin(a) * 2.5, z = near.z + Math.cos(a) * 2.5;
    const v = new CourtVampire(g, this.roster[id], 'ally', x, z, g.player.yaw);
    v.slot = slot;
    g.area.collision.resolveCircle(v.position, v.radius, v.position.y);
    g.allies.push(v);
    this.entities.set(id, v);
    return v;
  }

  buildCrowd(area) {
    const group = new THREE.Group();
    group.name = 'court-crowd';
    const make = (gender) => {
      const geo = createCrowdGeometry(gender);
      const ids = this.slots.filter((s) => this.roster[s.id].female === (gender === 'f')).map((s) => s.id);
      const n = ids.length;
      const mk = (g, mat) => {
        const m = new THREE.InstancedMesh(g, mat, n);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.castShadow = false;
        m.frustumCulled = false;
        group.add(m);
        return m;
      };
      const body = mk(geo.body, new THREE.MeshLambertMaterial({ color: 0xffffff }));
      const head = mk(geo.head, new THREE.MeshLambertMaterial({ color: 0xf0dcd8 }));
      const hair = mk(geo.hair, new THREE.MeshLambertMaterial({ color: 0xffffff }));
      const eyes = mk(geo.eyes, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2030).multiplyScalar(2.5), toneMapped: false }));
      const col = new THREE.Color();
      ids.forEach((id, i) => {
        const a = this.roster[id].appearance;
        body.setColorAt(i, col.set(a.main).lerp(new THREE.Color(a.accent), 0.15));
        hair.setColorAt(i, col.set(a.hairTip));
        head.setColorAt(i, col.set(a.skin));
        eyes.setColorAt(i, col.set(a.eye).multiplyScalar(2.5));
      });
      return { ids, body, head, hair, eyes, index: new Map(ids.map((id, i) => [id, i])) };
    };
    this.crowd = { group, m: make('m'), f: make('f'), phase: Math.random() * 10, dirty: true };
    area.group.add(group);
    this.updateCrowdMatrices(0, true);
  }

  updateCrowdMatrices(time, all = false) {
    const c = this.crowd;
    if (!c || !this.slotById) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const up = new THREE.Vector3(0, 1, 0);
    const pp = this.game.player.position;
    for (const set of [c.m, c.f]) {
      let changed = false;
      set.ids.forEach((id, i) => {
        const slot = this.slotById.get(id);
        const st = this.get(id);
        const hidden = st.s === 'dead' || this.entities.has(id) || (st.s === 'ally' && this.followers.includes(id));
        const dx = slot.x - pp.x, dz = slot.z - pp.z;
        const near = dx * dx + dz * dz < 70 * 70;
        if (!all && !near && slot._hidden === hidden) return;
        slot._hidden = hidden;
        if (hidden) m4.copy(zero);
        else {
          const sway = Math.sin(time * 1.3 + id) * 0.05;
          const bob = Math.abs(Math.sin(time * 2 + id * 1.7)) * 0.015;
          q.setFromAxisAngle(up, slot.yaw + sway);
          s.setScalar(this.roster[id].appearance.heightScale ?? 1);
          p.set(slot.x, slot.y + bob, slot.z);
          m4.compose(p, q, s);
        }
        set.body.setMatrixAt(i, m4);
        set.head.setMatrixAt(i, m4);
        set.hair.setMatrixAt(i, m4);
        set.eyes.setMatrixAt(i, m4);
        changed = true;
      });
      if (changed) for (const k of ['body', 'head', 'hair', 'eyes']) set[k].instanceMatrix.needsUpdate = true;
    }
  }

  // ── per-frame ──────────────────────────────────────────────────────────────────────────────────
  update(dt) {
    const g = this.game;
    // downed allies recover after a while
    for (const [id, v] of this.state) {
      if (v.downedT > 0) {
        v.downedT -= dt;
        if (v.downedT <= 0) {
          v.downedT = 0;
          if (this.followers.includes(id) && !this.entities.has(id) && g.player.alive) {
            this.spawnFollower(id, this.followers.indexOf(id), g.player.position);
            g.ui.toast(`${this.roster[id].name} has recovered and rejoins you.`, 'good');
          }
        }
      }
    }
    if (!this.slots) return;
    const pp = g.player.position;
    // pick the nearest non-materialised court members within range
    if (!this._scanT || this._scanT <= 0) {
      this._scanT = 0.3;
      const cands = [];
      for (const s of this.slots) {
        const st = this.get(s.id);
        if (st.s === 'dead' || this.entities.has(s.id) || (st.s === 'ally' && this.followers.includes(s.id))) continue;
        const d = Math.hypot(s.x - pp.x, s.z - pp.z);
        if (d < FULL_RADIUS) cands.push({ s, d });
      }
      cands.sort((a, b) => a.d - b.d);
      const materialised = [...this.entities.values()].filter((e) => e.mode !== 'ally' || !this.followers.includes(e.id)).length;
      let budget = MAX_FULL - materialised - this.buildQueue.length;
      for (const c of cands) {
        if (budget <= 0) break;
        if (this.buildQueue.includes(c.s)) continue;
        this.buildQueue.push(c.s);
        budget--;
      }
    } else this._scanT -= dt;
    // build at most one model per frame to avoid hitches
    const next = this.buildQueue.shift();
    if (next && !this.entities.has(next.id)) {
      const st = this.get(next.id);
      const mode = st.s === 'hostile' ? 'hostile' : st.s === 'ally' ? 'allyIdle' : 'neutral';
      const v = new CourtVampire(g, this.roster[next.id], mode === 'allyIdle' ? 'neutral' : mode, next.x, next.z, next.yaw);
      v.isIdleAlly = mode === 'allyIdle';
      this.entities.set(next.id, v);
      if (mode === 'hostile') g.enemies.push(v);
      else g.npcs.push(v);
      g.effects.burst(v.position.clone().setY(v.position.y + 1), { count: 6, color: 0x2a0a18, smoke: true, speed: 1, size: 0.6, life: 0.6, gravity: -0.2 });
    }
    // release far ones
    for (const [id, e] of this.entities) {
      if (e.mode === 'ally' && this.followers.includes(id)) continue;
      if (!e.alive) continue;
      if (e.mode === 'hostile' && e.target) continue;
      if (e.position.distanceTo(pp) > RELEASE_RADIUS) {
        e.removeMe = true;
        this.entities.delete(id);
      }
    }
    this.updateCrowdMatrices(g.area.time);
  }

  onEntityRemoved(e) {
    if (this.entities.get(e.id) === e) this.entities.delete(e.id);
  }

  // ── interactions ───────────────────────────────────────────────────────────────────────────────
  /** Dynamic interactables for nearby court members. */
  interactables() {
    const out = [];
    for (const e of this.entities.values()) {
      if (!e.alive || e.mode === 'hostile') continue;
      out.push({
        position: e.position,
        radius: 2.6,
        prompt: `Speak with ${e.name}`,
        subtitle: `Lv ${e.level} ${e.data.title} · Power: ${POWERS[e.data.power].name}${this.get(e.id).s === 'ally' ? ' · ALLY' : ''}`,
        enabled: true,
        court: e,
        onInteract: (game) => this.talk(e),
      });
    }
    return out;
  }

  talk(e) {
    const g = this.game;
    const d = e.data;
    this.met.add(d.id);
    const st = this.get(d.id);
    const power = POWERS[d.power];
    g.audio.play('ui_open');
    if (st.s === 'ally') {
      const following = this.followers.includes(d.id);
      g.dialogue.start([
        {
          speaker: d.name,
          sub: `Lv ${d.level} ${d.title} · your ally`,
          text: following ? 'I am at your side. Say the word and I will tear them apart.' : 'You called for me? My blade is yours.',
          choices: [
            following ? { text: 'Wait here at the court.', action: () => this.setFollow(d.id, false) } : { text: 'Follow me and fight beside me.', action: () => this.setFollow(d.id, true) },
            { text: 'Renounce our friendship (they will attack you!)', danger: true, action: () => this.renounce(d.id) },
            { text: 'Farewell.', action: () => {} },
          ],
        },
      ]);
      return;
    }
    g.dialogue.start([
      {
        speaker: d.name,
        sub: `Lv ${d.level} ${d.title} · House ${d.house}`,
        text: d.greeting,
        choices: [
          { text: `Offer friendship — they will fight beside you.`, action: () => this.befriend(d.id) },
          { text: `Challenge to a duel — kill them to steal "${power.name}".`, danger: true, action: () => this.duel(d.id) },
          { text: 'Leave them be.', action: () => {} },
        ],
      },
    ]);
  }

  befriend(id) {
    const g = this.game;
    const d = this.roster[id];
    this.set(id, { s: 'ally' });
    const e = this.entities.get(id);
    g.audio.play('quest');
    g.effects.ring(e ? e.position : g.player.position, { color: 0x6aff9a, radius: 2.5, duration: 0.6 });
    g.ui.toast(`${d.name} has sworn to fight beside you.`, 'good');
    g.dialogue.say(d.name, pick(ACCEPT_LINES));
    g.quests.notify('court_ally');
    if (this.followers.length < MAX_FOLLOWERS) this.setFollow(id, true, true);
    else g.ui.toast(`You already have ${MAX_FOLLOWERS} companions. ${d.name} will wait at the court (manage allies in the Inventory → Court tab).`, 'info');
    g.saveSoon();
  }

  setFollow(id, follow, silent = false) {
    const g = this.game;
    const d = this.roster[id];
    if (this.get(id).s !== 'ally') return;
    if (follow) {
      if (this.followers.includes(id)) return;
      if (this.followers.length >= MAX_FOLLOWERS) {
        g.ui.toast(`You can only lead ${MAX_FOLLOWERS} companions at once. Send one to wait first.`, 'warn');
        return;
      }
      this.followers.push(id);
      let e = this.entities.get(id);
      if (e && e.mode !== 'ally') {
        // convert the idle model into an active ally
        e.setMode('ally');
        e.isIdleAlly = false;
        g.npcs = g.npcs.filter((n) => n !== e);
        g.allies.push(e);
      } else if (!e) {
        e = this.spawnFollower(id, this.followers.length - 1, g.player.position);
      }
      this.followers.forEach((fid, i) => {
        const fe = this.entities.get(fid);
        if (fe) fe.slot = i;
      });
      if (!silent) g.ui.toast(`${d.name} follows you.`, 'good');
    } else {
      this.followers = this.followers.filter((f) => f !== id);
      const e = this.entities.get(id);
      if (e) {
        g.allies = g.allies.filter((a) => a !== e);
        if (this.slots) {
          e.setMode('neutral');
          e.isIdleAlly = true;
          g.npcs.push(e);
          const slot = this.slotById?.get(id);
          if (slot) e.home.set(slot.x, slot.y, slot.z);
        } else {
          e.removeMe = true;
          this.entities.delete(id);
          g.effects.burst(e.position.clone().setY(e.position.y + 1), { count: 20, color: 0x2a0a18, smoke: true, speed: 2, size: 0.8, life: 0.8, gravity: -0.3 });
        }
      }
      g.ui.toast(`${d.name} returns to Castle Nocturne to wait for you.`, 'info');
    }
    g.saveSoon();
  }

  duel(id) {
    const g = this.game;
    const d = this.roster[id];
    this.set(id, { s: 'hostile' });
    this.makeHostile(id);
    g.dialogue.say(d.name, pick(DUEL_LINES));
    g.ui.toast(`DUEL: ${d.name} (Lv ${d.level}). Kill them to steal ${POWERS[d.power].name}. If you die, you lose every stolen power!`, 'boss');
  }

  renounce(id) {
    const g = this.game;
    const d = this.roster[id];
    this.followers = this.followers.filter((f) => f !== id);
    this.set(id, { s: 'hostile' });
    this.makeHostile(id);
    g.dialogue.say(d.name, pick(RENOUNCE_LINES));
    g.audio.play('stinger', { volume: 0.6 });
    g.ui.toast(`${d.name} turns against you!`, 'boss');
    g.saveSoon();
  }

  /** Renounce from the menu (ally may be anywhere). */
  renounceFromMenu(id) {
    const g = this.game;
    const d = this.roster[id];
    if (!this.entities.get(id)) {
      // summon them in front of the player to settle it
      const p = g.player;
      const v = new CourtVampire(g, d, 'hostile', p.position.x + Math.sin(p.yaw) * 5, p.position.z + Math.cos(p.yaw) * 5, p.yaw + Math.PI);
      this.entities.set(id, v);
      g.enemies.push(v);
      g.effects.burst(v.position.clone().setY(v.position.y + 1), { count: 40, color: 0x1a0610, smoke: true, speed: 3, size: 1, life: 1, gravity: -0.3 });
    }
    this.renounce(id);
  }

  makeHostile(id) {
    const g = this.game;
    const e = this.entities.get(id);
    if (!e) return;
    g.npcs = g.npcs.filter((n) => n !== e);
    g.allies = g.allies.filter((a) => a !== e);
    e.setMode('hostile');
    e.target = g.player;
    if (!g.enemies.includes(e)) g.enemies.push(e);
    g.duelTarget = e;
  }

  onAllyDowned(e) {
    const g = this.game;
    const st = this.get(e.id);
    st.downedT = 45;
    this.state.set(e.id, st);
    g.allies = g.allies.filter((a) => a !== e);
    this.entities.delete(e.id);
    g.ui.toast(`${e.name} has fallen! They will recover in 45 seconds.`, 'warn');
  }

  /** A hostile court vampire was slain by the player. */
  onHostileKilled(e) {
    const g = this.game;
    const d = e.data;
    this.set(d.id, { s: 'dead' });
    this.entities.delete(d.id);
    g.powers.add(d.power, d.name, d.level);
    const power = POWERS[d.power];
    g.audio.play('levelup');
    g.renderer.doFlash(new THREE.Color(power.color).getHex(), 0.35, 2);
    g.effects.stream(e.position.clone().setY(e.position.y + 1), g.player.position.clone().setY(g.player.position.y + 1), { color: new THREE.Color(power.color).getHex(), count: 40, speed: 1.5, life: 0.8, size: 0.25 });
    g.ui.showPowerGain(power, d);
    g.quests.notify('court_duel');
    if (g.duelTarget === e) g.duelTarget = null;
    g.saveSoon();
  }

  /** The player died: every stolen power is lost. */
  onPlayerDeath() {
    const n = this.game.powers.clearAll();
    return n;
  }

  /** Remove hostile court members from the field when the area resets. */
  resetHostiles() {
    this.game.duelTarget = null;
  }
}

/** Deterministic court layout: clusters of vampires gathered around the castle grounds. */
export function generateCourtSlots(heightFn, region, avoid = []) {
  const rng = seeded(4040);
  const slots = [];
  const ids = getRoster().map((v) => v.id);
  let k = 0;
  const free = (x, z) => avoid.every((a) => Math.hypot(x - a.x, z - a.z) > a.r);
  let guard = 0;
  while (k < ids.length && guard++ < 20000) {
    const cx = rng.range(region.minX, region.maxX), cz = rng.range(region.minZ, region.maxZ);
    if (!free(cx, cz)) continue;
    const n = rng.int(3, 8);
    const R = 0.9 + n * 0.22;
    for (let i = 0; i < n && k < ids.length; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
      if (!free(x, z)) continue;
      // face the centre of the gathering
      const yaw = Math.atan2(cx - x, cz - z);
      slots.push({ id: ids[k++], x, z, y: heightFn(x, z), yaw });
    }
  }
  return slots;
}

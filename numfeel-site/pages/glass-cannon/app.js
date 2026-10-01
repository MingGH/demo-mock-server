/**
 * 玻璃大炮 - DOM 交互层（无业务公式，全部计算走 GlassCannonLogic）
 */
(function () {
  const L = window.GlassCannonLogic;

  const $ = function (id) { return document.getElementById(id); };

  const els = {
    sliders: {
      myHp: $('s-myhp'), myDps: $('s-mydps'), enemyHp: $('s-enemyhp'), enemyDps: $('s-enemydps')
    },
    values: {
      myHp: $('v-myhp'), myDps: $('v-mydps'), enemyHp: $('v-enemyhp'), enemyDps: $('v-enemydps')
    },
    buffToggle: $('buff-toggle'),
    replay: $('replay'),
    badgeMe: $('badge-me'),
    badgeEnemy: $('badge-enemy'),
    barMeFill: $('bar-me-fill'),
    barMeLabel: $('bar-me-label'),
    barEnemyFill: $('bar-enemy-fill'),
    barEnemyLabel: $('bar-enemy-label'),
    ticker: $('ticker'),
    log: $('log'),
    rKill: $('r-kill'), rKillSub: $('r-kill-sub'),
    rSurv: $('r-surv'), rSurvSub: $('r-surv-sub'),
    rAdv: $('r-adv'),
    rAdvBuff: $('r-advbuff'),
    verdict: $('verdict'),
    verdictDetail: $('verdict-detail'),
    mission: $('mission-status'),
    markerA: $('marker-a'), markerALabel: $('marker-a-label'),
    markerABuff: $('marker-abuff'), markerABuffLabel: $('marker-abuff-label'),
    presets: document.querySelectorAll('.preset-btn')
  };

  const PRESETS = {
    stomp: { myHp: 3000, myDps: 150, enemyHp: 2000, enemyDps: 40 },
    close: { myHp: 1500, myDps: 120, enemyHp: 2500, enemyDps: 60 },
    doomed: { myHp: 800, myDps: 60, enemyHp: 2400, enemyDps: 100 }
  };

  const state = { buffOn: false, raf: null, playing: false };
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function readStats() {
    return {
      myHp: Number(els.sliders.myHp.value),
      myDps: Number(els.sliders.myDps.value),
      enemyHp: Number(els.sliders.enemyHp.value),
      enemyDps: Number(els.sliders.enemyDps.value)
    };
  }

  function effectiveStats(stats) {
    return state.buffOn ? L.applyBuff(stats) : stats;
  }

  function fmtTime(sec) {
    if (sec === Infinity) return '∞';
    return sec.toFixed(1) + 's';
  }

  function fmtA(a) {
    if (a === Infinity) return '∞';
    return a.toFixed(2);
  }

  function fmtHp(v) {
    return Math.max(0, Math.round(v)).toString();
  }

  function pctOf(a) {
    if (a === Infinity) return 100;
    return Math.min(100, Math.max(0, (a / 3) * 100));
  }

  function clampLabelPct(p) {
    return Math.min(96, Math.max(4, p));
  }

  function setBar(fill, label, cur, total) {
    const frac = total === Infinity ? 1 : Math.max(0, Math.min(1, cur / total));
    fill.style.width = (frac * 100).toFixed(2) + '%';
    fill.classList.toggle('dead', cur <= 0 && total !== Infinity);
    label.textContent = fmtHp(cur) + ' / ' + fmtHp(total);
  }

  function logLine(text, cls) {
    const div = document.createElement('div');
    if (cls) div.className = cls;
    div.textContent = text;
    els.log.appendChild(div);
    els.log.scrollTop = els.log.scrollHeight;
  }

  function outcomeText(o) {
    return o === 'win' ? '你赢了' : (o === 'lose' ? '你输了' : '同归于尽');
  }

  function stopFight() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = null;
    state.playing = false;
  }

  function startFight() {
    stopFight();
    const stats = readStats();
    const eff = effectiveStats(stats);
    const t = L.fightTimes(eff);
    const endTime = Math.min(t.killTime, t.deathTime);

    els.log.innerHTML = '';
    logLine('0.0s 战斗开始', 'log-info');
    if (state.buffOn) logLine('你开启 buff：伤害 ×2，承伤 ×3', 'log-info');
    if (eff.enemyDps === 0) logLine('敌人输出为 0——这是一根木桩', 'log-info');

    function finish(simT) {
      const o = L.outcome(eff);
      setBar(els.barMeFill, els.barMeLabel, o === 'win' ? eff.myHp : 0, eff.myHp);
      setBar(els.barEnemyFill, els.barEnemyLabel, o === 'lose' ? eff.enemyHp : 0, eff.enemyHp);
      const stamp = simT === Infinity ? '' : simT.toFixed(1) + 's ';
      if (o === 'win') logLine(stamp + '敌人倒下——' + outcomeText(o), 'log-win');
      else if (o === 'lose') logLine(stamp + '你倒下了——' + outcomeText(o), 'log-lose');
      else logLine(stamp + '同时倒下——' + outcomeText(o), 'log-tie');
      state.playing = false;
    }

    if (reduceMotion || endTime === 0) {
      finish(endTime);
      return;
    }

    const realDuration = Math.min(6, Math.max(1.2, endTime / 6));
    const scale = realDuration / endTime;
    const t0 = performance.now();
    state.playing = true;

    function frame(now) {
      if (!state.playing) return;
      const simT = ((now - t0) / 1000) / scale;
      if (simT >= endTime) {
        finish(endTime);
        return;
      }
      const myCur = t.deathTime === Infinity ? eff.myHp : eff.myHp * (1 - simT / t.deathTime);
      const enemyCur = eff.enemyHp * (1 - simT / t.killTime);
      setBar(els.barMeFill, els.barMeLabel, myCur, eff.myHp);
      setBar(els.barEnemyFill, els.barEnemyLabel, enemyCur, eff.enemyHp);
      state.raf = requestAnimationFrame(frame);
    }
    state.raf = requestAnimationFrame(frame);
  }

  function renderVerdict(v) {
    els.verdict.textContent = v.headline;
    els.verdict.className = 'verdict' + (v.buffed.outcome === 'win' ? ' v-win' : (v.buffed.outcome === 'tie' ? ' v-tie' : ' v-lose'));
    els.verdictDetail.textContent = v.detail;
  }

  function renderMission(v, stats) {
    els.mission.classList.remove('ok', 'bad', 'tie');
    if (stats.enemyDps === 0) {
      els.mission.textContent = '🎯 木桩局：永远达成——但也没人会为打木桩配装';
      els.mission.classList.add('ok');
      return;
    }
    if (v.buffed.outcome === 'win') {
      els.mission.textContent = '✅ 达成：开着 buff 也能站到最后';
      els.mission.classList.add('ok');
    } else if (v.buffed.outcome === 'tie') {
      els.mission.textContent = '⚖️ 同归于尽——差一口气';
      els.mission.classList.add('tie');
    } else {
      els.mission.textContent = '❌ 未达成：承伤 ×3 先兑现了';
      els.mission.classList.add('bad');
    }
  }

  function renderAxis(v) {
    const pA = clampLabelPct(pctOf(v.A));
    const pAb = clampLabelPct(pctOf(v.Abuff));
    els.markerA.style.left = pA + '%';
    els.markerABuff.style.left = pAb + '%';
    els.markerALabel.textContent = 'A=' + fmtA(v.A);
    els.markerABuffLabel.textContent = 'A′=' + fmtA(v.Abuff);
  }

  function renderTicker(v, stats) {
    if (stats.enemyDps === 0) {
      els.ticker.innerHTML = '敌人输出为 0：你永远不会被击杀，buff 纯赚——但也没人会为打木桩配装。';
      return;
    }
    els.ticker.innerHTML =
      '开 buff 后：优势比 <strong>' + fmtA(v.A) + ' → ' + fmtA(v.Abuff) + '</strong>（×2/3）；' +
      '击杀 <strong>' + fmtTime(v.baseline.killTime) + ' → ' + fmtTime(v.buffed.killTime) + '</strong>，' +
      '被击杀 <strong>' + fmtTime(v.baseline.deathTime) + ' → ' + fmtTime(v.buffed.deathTime) + '</strong>。';
  }

  function renderNumbers() {
    const stats = readStats();
    const v = L.verdict(stats);

    els.values.myHp.textContent = stats.myHp;
    els.values.myDps.textContent = stats.myDps;
    els.values.enemyHp.textContent = stats.enemyHp;
    els.values.enemyDps.textContent = stats.enemyDps;

    const cur = state.buffOn ? v.buffed : v.baseline;
    els.rKill.textContent = fmtTime(cur.killTime);
    els.rKill.className = 'value' + (cur.outcome === 'win' ? ' hot' : '');
    els.rKillSub.textContent = state.buffOn
      ? '关 buff 时 ' + fmtTime(v.baseline.killTime)
      : '开 buff 后 ' + fmtTime(v.buffed.killTime);
    els.rSurv.textContent = fmtTime(cur.deathTime);
    els.rSurv.className = 'value' + (cur.outcome === 'lose' ? ' dead' : ' hot');
    els.rSurvSub.textContent = state.buffOn
      ? '关 buff 时 ' + fmtTime(v.baseline.deathTime)
      : '开 buff 后 ' + fmtTime(v.buffed.deathTime);
    els.rAdv.textContent = fmtA(v.A);
    els.rAdvBuff.textContent = fmtA(v.Abuff);

    renderVerdict(v);
    renderMission(v, stats);
    renderAxis(v);
    renderTicker(v, stats);
    return v;
  }

  function renderBuffToggle() {
    els.buffToggle.classList.toggle('on', state.buffOn);
    els.buffToggle.setAttribute('aria-pressed', String(state.buffOn));
    els.buffToggle.textContent = state.buffOn ? '🔴 buff 已激活（点我关闭）' : '🔴 buff 未激活（点我开启）';
    els.badgeMe.classList.toggle('on-me', state.buffOn);
    els.badgeEnemy.classList.toggle('on-enemy', state.buffOn);
  }

  function refresh() {
    renderBuffToggle();
    renderNumbers();
    startFight();
  }

  els.buffToggle.addEventListener('click', function () {
    state.buffOn = !state.buffOn;
    refresh();
  });

  els.replay.addEventListener('click', startFight);

  Object.keys(els.sliders).forEach(function (k) {
    els.sliders[k].addEventListener('input', function () {
      els.presets.forEach(function (b) { b.classList.remove('active'); });
      refresh();
    });
  });

  els.presets.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const p = PRESETS[btn.dataset.preset];
      els.sliders.myHp.value = p.myHp;
      els.sliders.myDps.value = p.myDps;
      els.sliders.enemyHp.value = p.enemyHp;
      els.sliders.enemyDps.value = p.enemyDps;
      els.presets.forEach(function (b) { b.classList.toggle('active', b === btn); });
      refresh();
    });
  });

  refresh();
})();

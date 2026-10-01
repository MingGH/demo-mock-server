/**
 * 玻璃大炮 - DOM 交互层（无业务公式，全部计算走 GlassCannonLogic）
 * 地牢规则：战斗手动开战；立绘状态化演出（受击/死亡/祝福/结算遮罩）。
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
    fight: $('btn-fight'),
    badgeMe: $('badge-me'),
    badgeEnemy: $('badge-enemy'),
    fighterMe: $('fighter-me'),
    fighterEnemy: $('fighter-enemy'),
    portraitMe: $('portrait-me'),
    portraitEnemy: $('portrait-enemy'),
    overlay: $('battle-overlay'),
    overlayText: $('battle-overlay-text'),
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
    altarA: $('altar-a'),
    altarABuff: $('altar-abuff'),
    altarBand: $('altar-band'),
    altarFight: $('btn-fight-altar'),
    arenaCard: $('arena-card'),
    presets: document.querySelectorAll('.preset-btn')
  };

  const PRESETS = {
    stomp: { myHp: 3000, myDps: 150, enemyHp: 2000, enemyDps: 40 },
    close: { myHp: 1500, myDps: 120, enemyHp: 2500, enemyDps: 60 },
    doomed: { myHp: 800, myDps: 60, enemyHp: 2400, enemyDps: 100 }
  };

  const state = { buffOn: false, raf: null, playing: false, finishTimer: null, overlayTimer: null };
  const hitTimers = new Map();
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

  function spawnFloat(fighterEl, text, cls) {
    const span = document.createElement('span');
    span.className = 'dmg-float ' + cls;
    span.textContent = text;
    span.style.left = (25 + Math.random() * 50) + '%';
    fighterEl.appendChild(span);
    span.addEventListener('animationend', function () { span.remove(); });
    setTimeout(function () { if (span.parentNode) span.remove(); }, 1200);
  }

  function flashHit(portrait) {
    if (reduceMotion) return;
    portrait.classList.remove('hit');
    void portrait.offsetWidth; // 重启动画
    portrait.classList.add('hit');
    const old = hitTimers.get(portrait);
    if (old) clearTimeout(old);
    hitTimers.set(portrait, setTimeout(function () { portrait.classList.remove('hit'); }, 200));
  }

  function hideOverlay() {
    if (state.overlayTimer) { clearTimeout(state.overlayTimer); state.overlayTimer = null; }
    els.overlay.classList.remove('show', 'fade', 'overlay-win', 'overlay-lose', 'overlay-tie');
  }

  function showOverlay(kind, text) {
    els.overlayText.textContent = text;
    els.overlay.classList.add('show', kind);
    if (!reduceMotion) {
      state.overlayTimer = setTimeout(function () {
        els.overlay.classList.add('fade');
      }, 1500);
    }
  }

  function resetArenaToStandby() {
    stopFight();
    hideOverlay();
    els.portraitMe.classList.remove('dead', 'hit');
    els.portraitEnemy.classList.remove('dead', 'hit');
    els.fighterMe.classList.remove('dead');
    els.fighterEnemy.classList.remove('dead');
    const eff = effectiveStats(readStats());
    setBar(els.barMeFill, els.barMeLabel, eff.myHp, eff.myHp);
    setBar(els.barEnemyFill, els.barEnemyLabel, eff.enemyHp, eff.enemyHp);
    els.log.innerHTML = '';
    logLine('🕯 队伍在地牢待命。施放祝福，然后按「开战」。', 'log-info');
    els.fight.textContent = '⚔ 开战';
    els.fight.disabled = false;
    els.buffToggle.disabled = false;
  }

  function outcomeText(o) {
    return o === 'win' ? '你赢了' : (o === 'lose' ? '你输了' : '同归于尽');
  }

  function overlayFor(o) {
    if (o === 'win') return { kind: 'overlay-win', text: '胜 利' };
    if (o === 'lose') return { kind: 'overlay-lose', text: '战 败' };
    return { kind: 'overlay-tie', text: '同归于尽' };
  }

  function stopFight() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = null;
    state.playing = false;
    if (state.finishTimer) { clearTimeout(state.finishTimer); state.finishTimer = null; }
  }

  function startFight() {
    stopFight();
    hideOverlay();
    els.portraitMe.classList.remove('dead', 'hit');
    els.portraitEnemy.classList.remove('dead', 'hit');
    els.fighterMe.classList.remove('dead');
    els.fighterEnemy.classList.remove('dead');

    const stats = readStats();
    const eff = effectiveStats(stats);
    const t = L.fightTimes(eff);
    const endTime = Math.min(t.killTime, t.deathTime);

    els.fight.disabled = true;
    els.buffToggle.disabled = true;
    els.log.innerHTML = '';
    logLine('0.0s 战斗开始', 'log-info');
    if (state.buffOn) logLine('牧师的祝福生效：战士输出 ×2，承伤 ×3', 'log-info');
    if (eff.enemyDps === 0) logLine('怪物输出为 0——这是一根木桩', 'log-info');

    function finish(simT) {
      const o = L.outcome(eff);
      // 结算时刻的精确剩余血量：败方归零，胜方保留被打掉的伤害
      const myFinal = t.deathTime === Infinity ? eff.myHp : Math.max(0, eff.myHp - eff.enemyDps * simT);
      const enemyFinal = Math.max(0, eff.enemyHp - eff.myDps * simT);
      setBar(els.barMeFill, els.barMeLabel, myFinal, eff.myHp);
      setBar(els.barEnemyFill, els.barEnemyLabel, enemyFinal, eff.enemyHp);

      const loserPortrait = o === 'win' ? els.portraitEnemy : (o === 'lose' ? els.portraitMe : null);
      const loserFighter = o === 'win' ? els.fighterEnemy : (o === 'lose' ? els.fighterMe : null);
      if (loserPortrait) loserPortrait.classList.add('dead');
      if (loserFighter) loserFighter.classList.add('dead');

      function settle() {
        const stamp = simT === Infinity ? '' : simT.toFixed(1) + 's ';
        if (o === 'win') logLine(stamp + '怪物倒下——' + outcomeText(o), 'log-win');
        else if (o === 'lose') logLine(stamp + '你倒下了——' + outcomeText(o), 'log-lose');
        else logLine(stamp + '同时倒下——' + outcomeText(o), 'log-tie');
        const ov = overlayFor(o);
        showOverlay(ov.kind, ov.text);
        state.playing = false;
        els.fight.disabled = false;
        els.buffToggle.disabled = false;
        els.fight.textContent = '⚔ 再战一场';
      }

      if (reduceMotion) {
        settle();
      } else {
        // 打击停顿：结算前停 300ms，让死亡姿态先立住
        state.finishTimer = setTimeout(settle, 300);
      }
    }

    if (reduceMotion || endTime === 0) {
      finish(endTime);
      return;
    }

    const realDuration = 3; // 战斗演出统一 3 秒
    const scale = realDuration / endTime;
    const floatEvery = 0.15; // 每 0.15 真实秒一跳伤害数字
    const t0 = performance.now();
    let lastFloatReal = -floatEvery;
    state.playing = true;

    function frame(now) {
      if (!state.playing) return;
      const realT = (now - t0) / 1000;
      const simT = realT / scale;
      if (simT >= endTime) {
        finish(endTime);
        return;
      }
      const myCur = t.deathTime === Infinity ? eff.myHp : eff.myHp * (1 - simT / t.deathTime);
      const enemyCur = eff.enemyHp * (1 - simT / t.killTime);
      setBar(els.barMeFill, els.barMeLabel, myCur, eff.myHp);
      setBar(els.barEnemyFill, els.barEnemyLabel, enemyCur, eff.enemyHp);
      while (realT - lastFloatReal >= floatEvery && realT > 0.1) {
        lastFloatReal += floatEvery;
        spawnFloat(els.fighterEnemy, '-' + fmtHp(eff.myDps * (floatEvery / scale)), 'dmg-to-enemy');
        flashHit(els.portraitEnemy);
        if (eff.enemyDps > 0) {
          spawnFloat(els.fighterMe, '-' + fmtHp(eff.enemyDps * (floatEvery / scale)), 'dmg-to-me');
          flashHit(els.portraitMe);
        }
      }
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
      els.mission.textContent = '✅ 达成：开着祝福也能站到最后';
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
      els.ticker.innerHTML = '怪物输出为 0：你永远不会被击杀，祝福纯赚——但也没人会为打木桩配装。';
      return;
    }
    els.ticker.innerHTML =
      '施放祝福后：优势比 <strong>' + fmtA(v.A) + ' → ' + fmtA(v.Abuff) + '</strong>（×2/3）；' +
      '击杀 <strong>' + fmtTime(v.baseline.killTime) + ' → ' + fmtTime(v.buffed.killTime) + '</strong>，' +
      '被击杀 <strong>' + fmtTime(v.baseline.deathTime) + ' → ' + fmtTime(v.buffed.deathTime) + '</strong>。';
  }

  function renderAltar(v, stats) {
    els.altarA.textContent = fmtA(v.A);
    els.altarABuff.textContent = fmtA(v.Abuff);
    els.altarBand.className = 'legend-chip';
    if (stats.enemyDps === 0) {
      els.altarBand.classList.add('chip-safe');
      els.altarBand.textContent = '木桩局，怎么开都赢';
      return;
    }
    if (v.band === 'safe') {
      els.altarBand.classList.add('chip-safe');
      els.altarBand.textContent = v.Abuff > 1 ? '安全区，怎么开都赢' : '安全区（施祝福后仍在 1.5 内）';
    } else if (v.band === 'flip') {
      els.altarBand.classList.add('chip-flip');
      els.altarBand.textContent = '毒区，施祝福必翻车';
    } else {
      els.altarBand.classList.add('chip-lose');
      els.altarBand.textContent = '败局，祝福只能让你输得更快';
    }
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
      ? '没祝福时 ' + fmtTime(v.baseline.killTime)
      : '有祝福时 ' + fmtTime(v.buffed.killTime);
    els.rSurv.textContent = fmtTime(cur.deathTime);
    els.rSurv.className = 'value' + (cur.outcome === 'lose' ? ' dead' : ' hot');
    els.rSurvSub.textContent = state.buffOn
      ? '没祝福时 ' + fmtTime(v.baseline.deathTime)
      : '有祝福时 ' + fmtTime(v.buffed.deathTime);
    els.rAdv.textContent = fmtA(v.A);
    els.rAdvBuff.textContent = fmtA(v.Abuff);

    renderVerdict(v);
    renderMission(v, stats);
    renderAxis(v);
    renderTicker(v, stats);
    renderAltar(v, stats);
  }

  function renderBuffToggle() {
    els.buffToggle.classList.toggle('on', state.buffOn);
    els.buffToggle.setAttribute('aria-pressed', String(state.buffOn));
    els.buffToggle.textContent = state.buffOn ? '✨ 祝福生效中（点击驱散）' : '✨ 牧师的祝福（未施放）';
    els.badgeMe.classList.toggle('on-me', state.buffOn);
    els.badgeEnemy.classList.toggle('on-enemy', state.buffOn);
    els.portraitMe.classList.toggle('blessed', state.buffOn);
  }

  function refresh() {
    renderBuffToggle();
    renderNumbers();
    resetArenaToStandby();
  }

  els.buffToggle.addEventListener('click', function () {
    if (state.playing) return;
    state.buffOn = !state.buffOn;
    refresh();
  });

  els.fight.addEventListener('click', startFight);

  els.altarFight.addEventListener('click', function () {
    els.arenaCard.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    startFight();
  });

  els.overlay.addEventListener('click', function () {
    els.overlay.classList.add('fade');
  });

  Object.keys(els.sliders).forEach(function (k) {
    els.sliders[k].addEventListener('input', function () {
      els.presets.forEach(function (b) { b.classList.remove('active'); });
      refresh();
    });
  });

  els.presets.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (state.playing) return;
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

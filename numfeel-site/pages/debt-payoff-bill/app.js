/**
 * app.js — 网贷上岸清单：DOM 交互层。
 * 业务公式全部在 debt-payoff-bill-logic.js（纯函数），本文件不写公式。
 */
'use strict';

(function (global) {
  // 浏览器：logic 以 <script> 先行加载并挂到 window；Node 桩测试：require 相对路径。
  const L = (typeof window !== 'undefined' && window.DebtBillLogic)
    || (typeof require === 'function' ? require('./debt-payoff-bill-logic.js') : null);

  const PRESETS = [
    {
      label: '刚开始滚',
      salary: 6000,
      term: 24,
      loans: [{ name: '平台A', amount: 50000, rate: 20 }],
    },
    {
      label: '以贷养贷中',
      salary: 7000,
      term: 24,
      loans: [
        { name: '平台A', amount: 80000, rate: 24 },
        { name: '平台B', amount: 60000, rate: 22 },
        { name: '平台C', amount: 40000, rate: 30 },
      ],
    },
    {
      label: '无解的账单',
      salary: 5000,
      term: 24,
      loans: [
        { name: '平台A', amount: 120000, rate: 23.9 },
        { name: '平台B', amount: 100000, rate: 18 },
        { name: '平台C', amount: 80000, rate: 35.9 },
      ],
    },
  ];

  const VERDICTS = {
    impossible: {
      cls: 'v-impossible',
      text: '数学上还不上：月供超过全部收入，只能以贷养贷，雪球越滚越大。',
    },
    critical: {
      cls: 'v-critical',
      text: '基本还不动：月供吃掉七成以上收入，一次意外就会断链。',
    },
    hard: {
      cls: 'v-hard',
      text: '能还但被压垮：一半以上收入进账单，生活只剩上班和还款。',
    },
    tight: {
      cls: 'v-tight',
      text: '很吃力：方案成立，但容错很小，别让任何一笔逾期。',
    },
    ok: {
      cls: 'v-ok',
      text: '还得起：这个方案在数学上成立。对照一下上面的银行月供，再决定怎么借。',
    },
    unknown: {
      cls: 'v-unknown',
      text: '填一下月薪，看看这笔账能不能成立。',
    },
  };

  const yuan = function (n) {
    return '¥' + Math.round(n).toLocaleString('zh-CN');
  };

  const pctText = function (n) {
    return Math.round(n) + '%';
  };

  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  /**
   * 创建应用。doc 需提供 getElementById / createElement，
   * 便于在 Node DOM 桩中做冒烟测试。
   * @param {Document} doc document-like 对象
   * @returns {{state: function(): object, recompute: function(): void,
   *   applyPreset: function(number): void, addLoan: function(): void,
   *   removeLoan: function(number): void}} 应用实例（附测试钩子）
   */
  function createApp(doc) {
    const els = {
      presetRow: doc.getElementById('preset-row'),
      loanRows: doc.getElementById('loan-rows'),
      addLoan: doc.getElementById('add-loan'),
      formError: doc.getElementById('form-error'),
      salary: doc.getElementById('salary'),
      term: doc.getElementById('term'),
      termValue: doc.getElementById('term-value'),
      receiptRows: doc.getElementById('receipt-rows'),
      sumPrincipal: doc.getElementById('sum-principal'),
      sumMonthly: doc.getElementById('sum-monthly'),
      sumInterest: doc.getElementById('sum-interest'),
      sumRate: doc.getElementById('sum-rate'),
      bankLine: doc.getElementById('bank-line'),
      affordTrack: doc.getElementById('afford-track'),
      affordFill: doc.getElementById('afford-fill'),
      affordLabel: doc.getElementById('afford-label'),
      affordPct: doc.getElementById('afford-pct'),
      verdict: doc.getElementById('verdict'),
    };

    const state = {
      loans: PRESETS[2].loans.map(function (l) { return { name: l.name, amount: l.amount, rate: l.rate }; }),
      salary: 5000,
      term: 24,
    };

    function showError(msg) {
      if (!els.formError) return;
      els.formError.textContent = msg;
      els.formError.hidden = false;
    }

    function hideError() {
      if (!els.formError) return;
      els.formError.hidden = true;
    }

    function buildLoanRow(loan, index) {
      const row = doc.createElement('div');
      row.className = 'loan-row';

      const name = doc.createElement('input');
      name.className = 'loan-name';
      name.setAttribute('type', 'text');
      name.setAttribute('placeholder', '平台名称');
      name.setAttribute('aria-label', '第' + (index + 1) + '笔名称');
      name.value = loan.name;
      name.addEventListener('input', function () {
        state.loans[index].name = name.value;
        hideError();
      });

      const amount = doc.createElement('input');
      amount.className = 'loan-amount';
      amount.setAttribute('type', 'number');
      amount.setAttribute('min', '0');
      amount.setAttribute('step', '1000');
      amount.setAttribute('inputmode', 'numeric');
      amount.setAttribute('aria-label', '第' + (index + 1) + '笔欠款');
      amount.value = loan.amount;
      amount.addEventListener('input', function () {
        const v = parseFloat(amount.value);
        state.loans[index].amount = Number.isFinite(v) && v >= 0 ? v : 0;
        hideError();
        recompute();
      });

      const rate = doc.createElement('input');
      rate.className = 'loan-rate';
      rate.setAttribute('type', 'number');
      rate.setAttribute('min', '0');
      rate.setAttribute('max', '100');
      rate.setAttribute('step', '0.1');
      rate.setAttribute('inputmode', 'decimal');
      rate.setAttribute('aria-label', '第' + (index + 1) + '笔年化利率');
      rate.value = loan.rate;
      rate.addEventListener('input', function () {
        const v = parseFloat(rate.value);
        state.loans[index].rate = Number.isFinite(v) && v >= 0 ? Math.min(v, 100) : 0;
        hideError();
        recompute();
      });

      const del = doc.createElement('button');
      del.className = 'loan-del';
      del.setAttribute('type', 'button');
      del.setAttribute('aria-label', '删除第' + (index + 1) + '笔');
      del.textContent = '✕';
      del.disabled = state.loans.length <= 1;
      del.addEventListener('click', function () {
        removeLoan(index);
      });

      row.appendChild(name);
      row.appendChild(amount);
      row.appendChild(rate);
      row.appendChild(del);
      return row;
    }

    function rebuildRows() {
      clearChildren(els.loanRows);
      state.loans.forEach(function (loan, i) {
        els.loanRows.appendChild(buildLoanRow(loan, i));
      });
    }

    function renderReceipt(summary) {
      clearChildren(els.receiptRows);
      summary.rows.forEach(function (row) {
        const line = doc.createElement('div');
        line.className = 'r-row';
        const cells = [
          { text: row.name, cls: 'r-name' },
          { text: yuan(row.amount), cls: 'r-val' },
          { text: pctText(row.rate), cls: 'r-rate' },
          { text: yuan(row.monthly) + '/月', cls: 'r-val' },
        ];
        cells.forEach(function (c) {
          const span = doc.createElement('span');
          span.className = c.cls;
          span.textContent = c.text;
          line.appendChild(span);
        });
        els.receiptRows.appendChild(line);
      });

      els.sumPrincipal.textContent = yuan(summary.totalPrincipal);
      els.sumMonthly.textContent = yuan(summary.totalMonthly);
      els.sumInterest.textContent = yuan(summary.totalInterest);
      els.sumRate.textContent = pctText(summary.weightedRate);

      const bank = L.bankComparison(summary.totalPrincipal, state.term);
      els.bankLine.textContent = '对照：同样 ' + yuan(summary.totalPrincipal)
        + ' 走银行信用贷（年化 4% · ' + bank.months + ' 期），月供约 ' + yuan(bank.monthly)
        + '。差距就是利率和期限。';
    }

    function renderAfford(totalMonthly) {
      const salary = Number(els.salary.value);
      const a = L.affordability(totalMonthly, salary);
      const v = VERDICTS[a.level];
      const ratio = Math.min(a.ratioPct, 100);

      els.affordFill.style.width = ratio + '%';
      els.affordTrack.setAttribute('aria-valuenow', String(Math.round(a.ratioPct)));
      els.affordTrack.className = 'afford-track ' + v.cls;
      els.affordFill.className = 'afford-fill ' + v.cls;

      els.affordLabel.textContent = a.remaining >= 0
        ? '每月还剩 ' + yuan(a.remaining)
        : '每月缺口 ' + yuan(Math.abs(a.remaining));
      els.affordPct.textContent = a.level === 'unknown' ? '—' : pctText(a.ratioPct);

      els.verdict.textContent = v.text;
      els.verdict.className = 'verdict ' + v.cls;
    }

    function recompute() {
      hideError();
      const term = parseInt(els.term.value, 10);
      state.term = term;
      state.salary = parseFloat(els.salary.value);
      els.termValue.textContent = term + ' 个月';
      let summary;
      try {
        summary = L.loanSummary(state.loans, term);
      } catch (e) {
        showError('参数有问题：' + e.message);
        return;
      }
      renderReceipt(summary);
      renderAfford(summary.totalMonthly);
    }

    function applyPreset(index) {
      const p = PRESETS[index];
      if (!p) return;
      state.loans = p.loans.map(function (l) { return { name: l.name, amount: l.amount, rate: l.rate }; });
      els.salary.value = String(p.salary);
      els.term.value = String(p.term);
      if (els.presetRow) {
        Array.prototype.forEach.call(els.presetRow.children, function (btn, i) {
          btn.className = 'preset-btn' + (i === index ? ' active' : '');
        });
      }
      rebuildRows();
      recompute();
    }

    function addLoan() {
      if (state.loans.length >= 8) return;
      state.loans.push({ name: '', amount: 0, rate: 20 });
      rebuildRows();
      recompute();
    }

    function removeLoan(index) {
      if (state.loans.length <= 1) return;
      state.loans.splice(index, 1);
      rebuildRows();
      recompute();
    }

    function bind() {
      if (els.presetRow) {
        Array.prototype.forEach.call(els.presetRow.children, function (btn, i) {
          btn.addEventListener('click', function () {
            applyPreset(i);
          });
        });
      }
      els.addLoan.addEventListener('click', addLoan);
      els.salary.addEventListener('input', recompute);
      els.term.addEventListener('input', recompute);
    }

    bind();
    rebuildRows();
    recompute();

    return {
      state: function () { return state; },
      recompute: recompute,
      applyPreset: applyPreset,
      addLoan: addLoan,
      removeLoan: removeLoan,
    };
  }

  if (typeof document !== 'undefined') {
    createApp(document);
  }

  const DebtBillApp = { createApp: createApp, PRESETS: PRESETS, VERDICTS: VERDICTS };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DebtBillApp;
  }
  if (typeof global !== 'undefined') {
    global.DebtBillApp = DebtBillApp;
  }
})(typeof window !== 'undefined' ? window : this);

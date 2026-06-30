/**
 * app.js — JS 二进制实验室 UI 层
 * 依赖：engine.js、Chart.js (CDN)
 */
(function () {
    'use strict';

    var API_BASE = 'https://numfeel-api.996.ninja';
    var WS_URL = 'wss://numfeel-api.996.ninja/js-binary-lab/ws';
    var eng = window.JsBinaryEngine;

    // ── 状态 ──
    var comparisonData = [];
    var anatomyData = [];
    var activeMetric = 'size';
    var chartInstance = null;
    var selectedScenario = null;
    var ws = null;
    var isCompiling = false;

    // ── DOM 缓存 ──
    var els = {};
    function cacheDom() {
        els.tabBtns = document.querySelectorAll('.tab-btn');
        els.sections = document.querySelectorAll('.section');
        // 板块1
        els.metricBtns = document.querySelectorAll('.metric-btn');
        els.comparisonChart = document.getElementById('comparisonChart');
        els.comparisonTbody = document.getElementById('comparisonTbody');
        els.toolCards = document.getElementById('toolCards');
        // 板块2
        els.toolSelect = document.getElementById('toolSelect');
        els.anatomySize = document.getElementById('anatomySize');
        els.heatmap = document.getElementById('heatmap');
        els.heatmapTooltip = document.getElementById('heatmapTooltip');
        els.segmentLegend = document.getElementById('segmentLegend');
        els.sectionsTbody = document.getElementById('sectionsTbody');
        els.stringsList = document.getElementById('stringsList');
        // 板块3
        els.scenarioCards = document.getElementById('scenarioCards');
        els.compilePanel = document.getElementById('compilePanel');
        els.selectedScenarioName = document.getElementById('selectedScenarioName');
        els.sourceView = document.getElementById('sourceView');
        els.btnCompile = document.getElementById('btnCompile');
        els.btnDownload = document.getElementById('btnDownload');
        els.progressWrap = document.getElementById('progressWrap');
        els.progressFill = document.getElementById('progressFill');
        els.progressLabel = document.getElementById('progressLabel');
        els.progressPct = document.getElementById('progressPct');
        els.compileLog = document.getElementById('compileLog');
    }

    // ═══════════════════════════════════════════════
    // 标签切换
    // ═══════════════════════════════════════════════
    function initTabs() {
        els.tabBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                els.tabBtns.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                els.sections.forEach(function (s) { s.classList.remove('active'); });
                var target = document.getElementById(btn.dataset.tab);
                if (target) target.classList.add('active');

                if (btn.dataset.tab === 'tab1' && !chartInstance && comparisonData.length) renderChart();
                if (btn.dataset.tab === 'tab2' && anatomyData.length) renderAnatomy();
                if (btn.dataset.tab === 'tab3' && els.scenarioCards.children.length === 0) initTab3();
            });
        });
    }

    // ═══════════════════════════════════════════════
    // 板块1: 编译对比
    // ═══════════════════════════════════════════════
    function loadComparison() {
        fetch(API_BASE + '/api/js-binary/comparison')
            .then(function (r) { return r.json(); })
            .then(function (resp) {
                if (resp.status === 200) {
                    comparisonData = resp.data;
                    renderComparison();
                }
            })
            .catch(function (e) {
                console.error('Failed to load comparison data:', e);
            });
    }

    function renderComparison() {
        renderChart();
        renderTable();
        renderToolCards();
    }

    function renderChart() {
        var sorted = eng.sortByMetric(comparisonData, activeMetric);
        var labels = sorted.map(function (d) { return d.tool; });
        var values = sorted.map(function (d) { return d[activeMetric]; });
        var colors = ['#ffd700', '#90caf9', '#ce93d8', '#81c784'];
        var bgColors = sorted.map(function (_, i) { return colors[i % colors.length]; });

        var metricLabel = activeMetric === 'size' ? '体积 (MB)' :
                          activeMetric === 'coldStartMs' ? '冷启动时间 (ms)' : '峰值内存 (KB)';
        var transform = activeMetric === 'size' ?
            function (v) { return v / 1024 / 1024; } :
            function (v) { return v; };

        if (chartInstance) chartInstance.destroy();

        var ctx = els.comparisonChart.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: metricLabel,
                    data: sorted.map(function (d) { return transform(d[activeMetric]); }),
                    backgroundColor: bgColors,
                    borderColor: bgColors,
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                var v = ctx.raw;
                                return activeMetric === 'size'
                                    ? eng.formatSize(sorted[ctx.dataIndex].size)
                                    : activeMetric === 'coldStartMs'
                                        ? v + ' ms'
                                        : v + ' KB';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#888' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { color: '#e0e0e0', font: { size: 12 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function renderTable() {
        var sorted = eng.sortByMetric(comparisonData, activeMetric);
        var html = '';
        sorted.forEach(function (d) {
            html += '<tr>' +
                '<td>' + d.tool + '</td>' +
                '<td class="highlight">' + eng.formatSize(d.size) + '</td>' +
                '<td class="highlight">' + d.coldStartMs + ' ms</td>' +
                '<td>' + (d.peakMemKb ? d.peakMemKb + ' KB' : '--') + '</td>' +
                '<td style="color:#90caf9;font-size:0.85rem;">' + d.desc + '</td>' +
                '</tr>';
        });
        els.comparisonTbody.innerHTML = html;
    }

    function renderToolCards() {
        var colors = ['#ffd700', '#90caf9', '#ce93d8', '#81c784'];
        var html = '';
        comparisonData.forEach(function (d, i) {
            html += '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px;border-left:3px solid ' + colors[i] + ';">' +
                '<div style="font-weight:600;color:' + colors[i] + ';margin-bottom:4px;">' + d.tool + '</div>' +
                '<div style="font-size:0.82rem;color:#aaa;">' + d.desc + '</div>' +
                '</div>';
        });
        els.toolCards.innerHTML = html;
    }

    function initMetricToggles() {
        els.metricBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                els.metricBtns.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                activeMetric = btn.dataset.metric;
                if (comparisonData.length) {
                    renderChart();
                    renderTable();
                }
            });
        });
    }

    // ═══════════════════════════════════════════════
    // 板块2: 二进制内窥
    // ═══════════════════════════════════════════════
    function loadAnatomy() {
        fetch(API_BASE + '/api/js-binary/anatomy')
            .then(function (r) { return r.json(); })
            .then(function (resp) {
                if (resp.status === 200) {
                    anatomyData = resp.data;
                    initAnatomySelect();
                }
            })
            .catch(function (e) {
                console.error('Failed to load anatomy data:', e);
            });
    }

    function initAnatomySelect() {
        els.toolSelect.innerHTML = anatomyData.map(function (d, i) {
            return '<option value="' + i + '">' + d.tool + '</option>';
        }).join('');
        els.toolSelect.addEventListener('change', renderAnatomy);
        renderAnatomy();
    }

    function renderAnatomy() {
        var idx = parseInt(els.toolSelect.value) || 0;
        var entry = anatomyData[idx];
        if (!entry) return;

        els.anatomySize.textContent = '总大小: ' + eng.formatSize(entry.size);

        // 热力图
        drawHeatmap(entry);

        // ELF sections
        var secHtml = '';
        (entry.sections || []).forEach(function (s) {
            secHtml += '<tr><td style="color:#90caf9;">' + s.name + '</td><td>' + s.offset + '</td><td>' + s.size + '</td></tr>';
        });
        els.sectionsTbody.innerHTML = secHtml || '<tr><td colspan="3" style="color:#888;">无 section 数据</td></tr>';

        // 字符串
        var strHtml = '';
        (entry.strings || []).forEach(function (s) {
            strHtml += '<div>' + s.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        });
        els.stringsList.innerHTML = strHtml || '<div style="color:#888;">无字符串数据</div>';

        // 图例 + 统计
        var stats = eng.segmentTypeStats(entry.segments);
        var legendHtml = '';
        var types = ['text', 'data', 'code', 'zero'];
        types.forEach(function (t) {
            if (stats[t] > 0) {
                legendHtml += '<span><span class="legend-dot" style="background:' + eng.segmentColor(t) + ';"></span> ' +
                    t + ' (' + eng.formatSize(stats[t]) + ')</span>';
            }
        });
        els.segmentLegend.innerHTML = legendHtml;
    }

    function drawHeatmap(entry) {
        var canvas = els.heatmap;
        var ctx = canvas.getContext('2d');
        var dpr = window.devicePixelRatio || 1;

        // Canvas 实际尺寸
        var rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = 80 * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = '80px';
        ctx.scale(dpr, dpr);

        var w = rect.width;
        var h = 80;
        var total = entry.size;
        var segments = entry.segments;

        // 绘制每个 segment
        segments.forEach(function (seg) {
            var x = (seg.offset / total) * w;
            var segW = Math.max(1, (seg.size / total) * w);
            ctx.fillStyle = eng.segmentColor(seg.type);
            ctx.fillRect(x, 0, segW, h);
        });

        // 悬停事件
        canvas.onmousemove = function (e) {
            var mx = e.offsetX;
            var ratio = mx / w;
            var byteOffset = Math.floor(ratio * total);
            var seg = null;
            for (var i = 0; i < segments.length; i++) {
                if (byteOffset >= segments[i].offset && byteOffset < segments[i].offset + segments[i].size) {
                    seg = segments[i];
                    break;
                }
            }
            if (seg) {
                var tooltip = els.heatmapTooltip;
                tooltip.style.display = 'block';
                tooltip.style.left = (mx + 10) + 'px';
                tooltip.style.top = (e.offsetY - 40) + 'px';
                tooltip.textContent = '0x' + seg.offset.toString(16) +
                    ' · ' + eng.formatSize(seg.size) +
                    ' · type: ' + seg.type;
            }
        };
        canvas.onmouseleave = function () {
            els.heatmapTooltip.style.display = 'none';
        };
    }

    // ═══════════════════════════════════════════════
    // 板块3: 在线编译
    // ═══════════════════════════════════════════════
    function initTab3() {
        var scenarios = eng.getScenarios();
        var html = '';
        scenarios.forEach(function (sc) {
            html += '<div class="scenario-card" data-scenario="' + sc.id + '" onclick="window.__selectScenario(\'' + sc.id + '\')">' +
                '<i class="ti ' + sc.icon + '"></i>' +
                '<div class="sc-name">' + sc.name + '</div>' +
                '<div class="sc-desc">' + sc.desc + '</div>' +
                '</div>';
        });
        els.scenarioCards.innerHTML = html;

        window.__selectScenario = function (id) {
            var scenarios = eng.getScenarios();
            var sc = null;
            for (var i = 0; i < scenarios.length; i++) {
                if (scenarios[i].id === id) { sc = scenarios[i]; break; }
            }
            if (!sc) return;

            selectedScenario = sc;
            document.querySelectorAll('.scenario-card').forEach(function (c) { c.classList.remove('selected'); });
            document.querySelector('[data-scenario="' + id + '"]').classList.add('selected');
            els.compilePanel.style.display = 'block';
            els.selectedScenarioName.textContent = '编译：' + sc.name;
            els.sourceView.value = sc.code;
            resetCompileUI();
        };
    }

    function resetCompileUI() {
        els.progressWrap.classList.remove('visible');
        els.progressFill.style.width = '0';
        els.progressPct.textContent = '0%';
        els.progressLabel.textContent = '就绪';
        els.compileLog.classList.remove('visible');
        els.compileLog.innerHTML = '';
        els.btnCompile.classList.remove('loading');
        els.btnDownload.classList.remove('visible');
        els.btnCompile.disabled = false;
    }

    function initCompileButton() {
        els.btnCompile.addEventListener('click', function () {
            if (isCompiling || !selectedScenario) return;
            startCompile();
        });
    }

    function startCompile() {
        isCompiling = true;
        els.btnCompile.classList.add('loading');
        els.btnCompile.disabled = true;
        els.btnDownload.classList.remove('visible');
        els.progressWrap.classList.add('visible');
        els.compileLog.classList.add('visible');
        els.compileLog.innerHTML = '';
        addLog('开始编译 ' + selectedScenario.name + '...', 'stage');
        addLog('连接编译服务...', '');

        // WebSocket
        try {
            ws = new WebSocket(WS_URL);
        } catch (e) {
            // fallback for local dev
            ws = new WebSocket('ws://localhost:8080/js-binary-lab/ws');
        }

        ws.onopen = function () {
            addLog('已连接，发送编译请求...', '');
            ws.send(JSON.stringify({ scenario: selectedScenario.id }));
        };

        ws.onmessage = function (e) {
            try {
                var msg = JSON.parse(e.data);
                handleCompileMessage(msg);
            } catch (err) {
                addLog('收到: ' + e.data, '');
            }
        };

        ws.onerror = function () {
            addLog('WebSocket 连接错误', 'error');
            finishCompile(false);
        };

        ws.onclose = function () {
            if (isCompiling) {
                addLog('连接已关闭', '');
                finishCompile(false);
            }
        };

        // 超时
        setTimeout(function () {
            if (isCompiling) {
                addLog('编译超时（60秒）', 'error');
                finishCompile(false);
            }
        }, 60000);
    }

    function handleCompileMessage(msg) {
        if (msg.type === 'progress') {
            updateProgress(msg.stage, msg.percent, msg.message);
            addLog('[' + msg.stage + '] ' + msg.message, '');
            if (msg.percent === 100) {
                addLog('编译完成！', 'done');
            }
        } else if (msg.type === 'download') {
            addLog('产物大小: ' + eng.formatSize(msg.size || 0), 'done');
            addLog('点击「下载产物」按钮保存到本地', 'done');
            // 设置下载链接
            var blob = base64ToBlob(msg.data, 'application/octet-stream');
            var url = URL.createObjectURL(blob);
            els.btnDownload.href = url;
            els.btnDownload.download = msg.filename || 'output';
            els.btnDownload.classList.add('visible');
            finishCompile(true);
        } else if (msg.type === 'error') {
            addLog('错误: ' + msg.message, 'error');
            finishCompile(false);
        }
    }

    function updateProgress(stage, percent, message) {
        els.progressFill.style.width = percent + '%';
        els.progressPct.textContent = percent + '%';
        els.progressLabel.textContent = stage;
    }

    function addLog(text, cls) {
        var div = document.createElement('div');
        div.className = 'log-line' + (cls ? ' ' + cls : '');
        div.textContent = text;
        els.compileLog.appendChild(div);
        els.compileLog.scrollTop = els.compileLog.scrollHeight;
    }

    function finishCompile(success) {
        isCompiling = false;
        els.btnCompile.classList.remove('loading');
        if (!success) {
            els.btnCompile.disabled = false;
            els.progressFill.style.background = '#ff6b6b';
        }
        if (ws) {
            try { ws.close(); } catch (e) { /* ignore */ }
            ws = null;
        }
    }

    function base64ToBlob(b64, mime) {
        var byteChars = atob(b64);
        var byteArrays = [];
        for (var offset = 0; offset < byteChars.length; offset += 512) {
            var slice = byteChars.slice(offset, offset + 512);
            var byteNumbers = new Array(slice.length);
            for (var i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }
            byteArrays.push(new Uint8Array(byteNumbers));
        }
        return new Blob(byteArrays, { type: mime });
    }

    // ═══════════════════════════════════════════════
    // 初始化
    // ═══════════════════════════════════════════════
    function init() {
        cacheDom();
        initTabs();
        initMetricToggles();
        initCompileButton();
        initTab3();

        loadComparison();
        loadAnatomy();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

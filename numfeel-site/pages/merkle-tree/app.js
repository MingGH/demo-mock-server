// ========== 默克尔树 Demo 交互逻辑 ==========

// ── 行为埋点（通用埋点 SDK，见 components/track.js）──
// 事件清单：
// - session_start: 页面加载初始化（布尔守卫，每次加载记一次），回答"有多少页面访问"
// - add_preset:    添加预设数据 {leaves}，回答"叶子规模"
// - add_custom:    添加自定义数据 {leaves}，回答"自定义输入次数"（不上报内容）
// - reset:         重置，回答"多少人重置重试"
// - build:         构建树 {leaves}，回答"构建树的叶子数"
// - tamper:        篡改演示 {leaves}，回答"多少人看篡改演示"
// - proof:         生成 Proof {leaves, verified}，回答"验证结果"
// - session_end:   pagehide 离开时的收尾（force:true，镜像到 umami），回答"真实离开频次"
// 只镜像低频收尾事件 session_end 到 umami；高频事件一律不镜像。
window.NF_TRACK_UMAMI_MIRROR = ['session_end'];
let trackSessionActive = false;

/** 安全调用 NFTrack；SDK 未加载、被拦截或抛错都不应影响页面。 */
function nfTrack(name, props, opts) {
  try { if (window.NFTrack) window.NFTrack.track(name, props, opts); } catch (e) {}
}

function trackSessionStart() {
  if (trackSessionActive) return;
  trackSessionActive = true;
  nfTrack('session_start', {});
}

function trackSessionEnd(reason) {
  if (!trackSessionActive) return;
  trackSessionActive = false;
  nfTrack('session_end', { reason: reason }, { force: true });
}

function trackSessionHidden() {
  if (!trackSessionActive) return;
  nfTrack('session_hidden', { reason: 'hidden' }, { force: true });
}

function registerTrackLeaveHandler() {
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') trackSessionHidden();
  });
  window.addEventListener('pagehide', function () { trackSessionEnd('leave'); });
}
trackSessionStart();
registerTrackLeaveHandler();

const { sha256, buildMerkleTree, getMerkleProof, verifyMerkleProof, getAffectedPath, shortHash } = MerkleEngine;

let leaves = [];
let currentTree = null;
let originalTree = null;

// ── 添加数据块 ──
function addPreset(content) {
  if (leaves.length >= 8) {
    alert('最多支持 8 个叶子节点');
    return;
  }
  if (leaves.includes(content)) {
    alert('该数据块已添加');
    return;
  }
  nfTrack('add_preset', { leaves: leaves.length });
  leaves.push(content);
  renderLeafList();
  updateBuildBtn();
}

function addCustom() {
  const input = document.getElementById('customInput');
  const val = input.value.trim();
  if (!val) return;
  if (leaves.length >= 8) {
    alert('最多支持 8 个叶子节点');
    return;
  }
  if (leaves.includes(val)) {
    alert('该数据块已添加');
    return;
  }
  leaves.push(val);
  input.value = '';
  nfTrack('add_custom', { leaves: leaves.length });
  renderLeafList();
  updateBuildBtn();
}

function removeLeaf(idx) {
  leaves.splice(idx, 1);
  renderLeafList();
  updateBuildBtn();
}

async function renderLeafList() {
  const container = document.getElementById('leafList');
  if (leaves.length === 0) {
    container.innerHTML = '<div class="empty-hint"><i class="ti ti-arrow-up"></i> 点击上方按钮添加数据块（至少2个）</div>';
    return;
  }

  let html = '';
  for (let i = 0; i < leaves.length; i++) {
    const hash = await sha256(leaves[i]);
    html += `
      <div class="leaf-item">
        <span class="leaf-idx">${i + 1}</span>
        <span class="leaf-content">${escapeHtml(leaves[i])}</span>
        <span class="leaf-hash">${shortHash(hash, 6)}</span>
        <button class="leaf-remove" onclick="removeLeaf(${i})" title="移除"><i class="ti ti-x"></i></button>
      </div>
    `;
  }
  container.innerHTML = html;
}

function updateBuildBtn() {
  document.getElementById('buildBtn').disabled = leaves.length < 2;
}

function resetAll() {
  leaves = [];
  currentTree = null;
  originalTree = null;
  nfTrack('reset', {});
  renderLeafList();
  updateBuildBtn();
  document.getElementById('treeViz').style.display = 'none';
  document.getElementById('tamperSection').style.display = 'none';
  document.getElementById('proofSection').style.display = 'none';
  document.getElementById('chainSection').style.display = 'none';
  document.getElementById('tamperResult').style.display = 'none';
  document.getElementById('proofResult').style.display = 'none';
}

// ── 构建树 ──
async function buildTree() {
  if (leaves.length < 2) return;
  nfTrack('build', { leaves: leaves.length });

  currentTree = await buildMerkleTree(leaves);
  originalTree = await buildMerkleTree(leaves);

  // 显示树可视化
  document.getElementById('treeViz').style.display = 'block';
  document.getElementById('rootHashDisplay').textContent = currentTree.root;
  drawTree(currentTree);

  // 显示后续模块
  document.getElementById('tamperSection').style.display = 'block';
  document.getElementById('proofSection').style.display = 'block';
  document.getElementById('chainSection').style.display = 'block';

  // 填充选择器
  fillSelectors();

  // 更新区块链可视化
  document.getElementById('yourMerkleRoot').textContent = shortHash(currentTree.root, 6);
  document.getElementById('yourTxnCount').textContent = `${leaves.length} 条记录`;

  // 滚动到树可视化
  document.getElementById('treeViz').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function fillSelectors() {
  const tamperSelect = document.getElementById('tamperTarget');
  const proofSelect = document.getElementById('proofTarget');

  let options = '';
  leaves.forEach((leaf, i) => {
    const label = leaf.length > 20 ? leaf.slice(0, 20) + '...' : leaf;
    options += `<option value="${i}">叶子 ${i + 1}: ${escapeHtml(label)}</option>`;
  });

  tamperSelect.innerHTML = options;
  proofSelect.innerHTML = options;
}

// ── 绘制树 ──
function drawTree(tree, highlightPath) {
  const canvas = document.getElementById('treeCanvas');
  const ctx = canvas.getContext('2d');

  // 高分辨率
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.parentElement.clientWidth;
  const height = Math.min(400, 60 + tree.levels.length * 80);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, height);

  const totalLevels = tree.levels.length;
  const levelHeight = (height - 40) / totalLevels;

  // 计算每个节点的位置
  const positions = [];
  for (let level = 0; level < totalLevels; level++) {
    const nodes = tree.levels[level];
    const y = height - 30 - level * levelHeight;
    const nodesInLevel = nodes.length;
    const spacing = width / (nodesInLevel + 1);

    const levelPositions = [];
    for (let i = 0; i < nodesInLevel; i++) {
      levelPositions.push({
        x: spacing * (i + 1),
        y: y,
        node: nodes[i]
      });
    }
    positions.push(levelPositions);
  }

  // 画连线
  for (let level = 1; level < totalLevels; level++) {
    for (let i = 0; i < positions[level].length; i++) {
      const parent = positions[level][i];
      const leftChildIdx = i * 2;
      const rightChildIdx = i * 2 + 1;

      if (leftChildIdx < positions[level - 1].length) {
        const leftChild = positions[level - 1][leftChildIdx];
        drawLine(ctx, parent, leftChild, highlightPath, tree, level, leftChildIdx);
      }
      if (rightChildIdx < positions[level - 1].length) {
        const rightChild = positions[level - 1][rightChildIdx];
        drawLine(ctx, parent, rightChild, highlightPath, tree, level, rightChildIdx);
      }
    }
  }

  // 画节点
  for (let level = 0; level < totalLevels; level++) {
    for (let i = 0; i < positions[level].length; i++) {
      const pos = positions[level][i];
      const isRoot = level === totalLevels - 1;
      const isLeaf = level === 0;
      const isHighlighted = highlightPath && highlightPath.some(
        h => h.level === level && h.index === i
      );

      let color = '#555';
      let textColor = '#999';
      if (isRoot) { color = '#ffd700'; textColor = '#ffd700'; }
      else if (isLeaf) { color = '#81c784'; textColor = '#81c784'; }
      else { color = '#90caf9'; textColor = '#90caf9'; }

      if (isHighlighted) { color = '#ff6b6b'; textColor = '#ff6b6b'; }

      // 画圆
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isRoot ? 16 : 12, 0, Math.PI * 2);
      ctx.fillStyle = color + '22';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 画哈希文字
      ctx.font = '10px monospace';
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.fillText(shortHash(pos.node.hash, 4), pos.x, pos.y + (isRoot ? 28 : 24));

      // 叶子层画内容标签
      if (isLeaf && pos.node.content) {
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#666';
        const label = pos.node.content.length > 8 ? pos.node.content.slice(0, 8) + '…' : pos.node.content;
        ctx.fillText(label, pos.x, pos.y + 36);
      }
    }
  }
}

function drawLine(ctx, from, to, highlightPath, tree, level, childIdx) {
  const isHighlighted = highlightPath && highlightPath.some(
    h => (h.level === level && h.index === Math.floor(childIdx / 2)) ||
         (h.level === level - 1 && h.index === childIdx)
  );

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = isHighlighted ? 'rgba(255, 107, 107, 0.6)' : 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = isHighlighted ? 2 : 1;
  ctx.stroke();
}

// ── 篡改 ──
async function tamperLeaf() {
  const idx = parseInt(document.getElementById('tamperTarget').value);
  nfTrack('tamper', { leaves: leaves.length });
  const newContent = document.getElementById('tamperInput').value.trim();
  if (!newContent) {
    alert('请输入篡改后的内容');
    return;
  }

  // 篡改并重建树
  const tamperedLeaves = [...leaves];
  tamperedLeaves[idx] = newContent;
  const tamperedTree = await buildMerkleTree(tamperedLeaves);

  // 计算受影响路径
  const affected = getAffectedPath(originalTree, tamperedTree);

  // 显示结果
  document.getElementById('tamperResult').style.display = 'block';
  document.getElementById('affectedCount').textContent = `${affected.length} 个节点的哈希发生变化（共 ${getTotalNodes(originalTree)} 个节点）`;

  let diffHtml = '';
  for (const node of affected) {
    const levelLabel = node.level === 0 ? '叶子' :
                       node.level === originalTree.levels.length - 1 ? '根' : `第${node.level}层`;
    diffHtml += `
      <div class="diff-item changed">
        <div class="diff-label">${levelLabel} #${node.index + 1}${node.content ? ' - ' + escapeHtml(node.content.slice(0, 20)) : ''}</div>
        <div class="diff-old">- ${shortHash(node.oldHash, 12)}</div>
        <div class="diff-new">+ ${shortHash(node.newHash, 12)}</div>
      </div>
    `;
  }
  document.getElementById('diffList').innerHTML = diffHtml;

  // 在树上高亮受影响路径
  drawTree(originalTree, affected);
}

function getTotalNodes(tree) {
  let total = 0;
  for (const level of tree.levels) total += level.length;
  return total;
}

// ── Merkle Proof ──
async function showProof() {
  const idx = parseInt(document.getElementById('proofTarget').value);
  nfTrack('proof', { leaves: leaves.length });
  const proof = getMerkleProof(currentTree, idx);

  document.getElementById('proofResult').style.display = 'block';

  let stepsHtml = '';
  stepsHtml += `
    <div class="proof-step">
      <span class="step-num">起点</span>
      <span class="step-content">叶子 ${idx + 1} 的哈希</span>
      <span class="step-hash">${shortHash(currentTree.levels[0][idx].hash, 10)}</span>
    </div>
  `;

  for (let i = 0; i < proof.length; i++) {
    stepsHtml += `
      <div class="proof-step">
        <span class="step-num">${i + 1}</span>
        <span class="step-content">与${proof[i].side === 'right' ? '右' : '左'}兄弟拼接后哈希</span>
        <span class="step-side">${proof[i].side === 'right' ? '→' : '←'}</span>
        <span class="step-hash">${shortHash(proof[i].hash, 10)}</span>
      </div>
    `;
  }

  document.getElementById('proofSteps').innerHTML = stepsHtml;

  // 验证
  const leafHash = currentTree.levels[0][idx].hash;
  const verified = await verifyMerkleProof(leafHash, proof, currentTree.root);

  document.getElementById('proofSummary').innerHTML = `
    <strong>验证结果：${verified ? '✓ 通过' : '✗ 失败'}</strong><br>
    只需 <strong>${proof.length}</strong> 个兄弟哈希，就能从叶子推算出根哈希并比对。<br>
    如果有 100 万个叶子（2²⁰），也只需要 <strong>20</strong> 个哈希就够了。<br>
    这就是比特币 SPV 钱包能在手机上运行的原因——不需要下载全部交易数据。
  `;
}

// ── 工具函数 ──
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 监听回车键
document.getElementById('customInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addCustom();
});

document.getElementById('tamperInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tamperLeaf();
});

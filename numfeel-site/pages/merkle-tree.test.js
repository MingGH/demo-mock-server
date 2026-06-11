// 测试文件：默克尔树核心算法
const { sha256Sync, buildMerkleTreeSync, getMerkleProof, verifyMerkleProofSync, getAffectedPath, shortHash } = require('./merkle-tree/engine.js');

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

console.log('\n🧪 默克尔树 - 核心算法测试\n');

// ── SHA-256 ──
console.log('--- sha256Sync ---');
const h1 = sha256Sync('hello');
assert(h1 === '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824', `SHA-256("hello") 正确: ${h1.slice(0,12)}...`);
const h2 = sha256Sync('');
assert(h2 === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'SHA-256("") 正确');
assert(sha256Sync('a') !== sha256Sync('b'), '不同输入产生不同哈希');

// ── buildMerkleTreeSync ──
console.log('--- buildMerkleTreeSync ---');
const tree2 = buildMerkleTreeSync(['A', 'B']);
assert(tree2 !== null, '2个叶子能构建树');
assert(tree2.levels.length === 2, '2个叶子 => 2层');
assert(tree2.levels[0].length === 2, '叶子层有2个节点');
assert(tree2.levels[1].length === 1, '根层有1个节点');
assert(tree2.root === tree2.levels[1][0].hash, '根哈希一致');

const tree4 = buildMerkleTreeSync(['A', 'B', 'C', 'D']);
assert(tree4.levels.length === 3, '4个叶子 => 3层');
assert(tree4.levels[0].length === 4, '叶子层4个');
assert(tree4.levels[1].length === 2, '中间层2个');
assert(tree4.levels[2].length === 1, '根层1个');

const tree3 = buildMerkleTreeSync(['A', 'B', 'C']);
assert(tree3.levels.length === 3, '3个叶子（奇数）=> 3层');
assert(tree3.levels[1].length === 2, '奇数叶子：中间层仍是2个');

// ── 确定性 ──
console.log('--- 确定性 ---');
const tree_a = buildMerkleTreeSync(['X', 'Y', 'Z']);
const tree_b = buildMerkleTreeSync(['X', 'Y', 'Z']);
assert(tree_a.root === tree_b.root, '相同输入 => 相同根哈希');

const tree_c = buildMerkleTreeSync(['X', 'Z', 'Y']);
assert(tree_a.root !== tree_c.root, '不同顺序 => 不同根哈希');

// ── 篡改检测 ──
console.log('--- 篡改检测 ---');
const original = buildMerkleTreeSync(['合同A', '照片B', '日记C', '代码D']);
const tampered = buildMerkleTreeSync(['合同A（已篡改）', '照片B', '日记C', '代码D']);
assert(original.root !== tampered.root, '篡改一个叶子 => 根哈希变化');

const affected = getAffectedPath(original, tampered);
assert(affected.length > 0, '检测到受影响节点');
assert(affected[0].level === 0, '第一个受影响的是叶子层');
assert(affected[affected.length - 1].level === original.levels.length - 1, '最后一个受影响的是根层');
// 对于4个叶子的树，篡改1个叶子应影响 log2(4)+1 = 3 个节点
assert(affected.length === 3, `4叶子树篡改1叶影响3个节点: 实际${affected.length}`);

// ── Merkle Proof ──
console.log('--- getMerkleProof ---');
const proof0 = getMerkleProof(tree4, 0);
assert(proof0.length === 2, `4叶子树: proof长度=2 (log2(4)): 实际${proof0.length}`);
assert(proof0[0].side === 'right', '叶子0的第一个兄弟在右边');

const proof3 = getMerkleProof(tree4, 3);
assert(proof3.length === 2, '叶子3的proof长度也是2');
assert(proof3[0].side === 'left', '叶子3的第一个兄弟在左边');

// ── verifyMerkleProofSync ──
console.log('--- verifyMerkleProofSync ---');
const leaf0Hash = tree4.levels[0][0].hash;
const verified = verifyMerkleProofSync(leaf0Hash, proof0, tree4.root);
assert(verified === true, '正确的proof验证通过');

const wrongRoot = sha256Sync('wrong');
const failedVerify = verifyMerkleProofSync(leaf0Hash, proof0, wrongRoot);
assert(failedVerify === false, '错误的根哈希验证失败');

const wrongLeaf = sha256Sync('tampered');
const failedVerify2 = verifyMerkleProofSync(wrongLeaf, proof0, tree4.root);
assert(failedVerify2 === false, '篡改后的叶子验证失败');

// 验证所有叶子
for (let i = 0; i < 4; i++) {
  const p = getMerkleProof(tree4, i);
  const v = verifyMerkleProofSync(tree4.levels[0][i].hash, p, tree4.root);
  assert(v === true, `叶子${i}验证通过`);
}

// ── 大树测试 ──
console.log('--- 大树 (8叶子) ---');
const bigLeaves = ['A','B','C','D','E','F','G','H'];
const bigTree = buildMerkleTreeSync(bigLeaves);
assert(bigTree.levels.length === 4, '8叶子 => 4层 (log2(8)+1)');
assert(bigTree.levels[0].length === 8, '叶子层8个');
assert(bigTree.levels[3].length === 1, '根层1个');

const bigProof = getMerkleProof(bigTree, 5);
assert(bigProof.length === 3, '8叶子树proof长度=3 (log2(8))');
const bigVerified = verifyMerkleProofSync(bigTree.levels[0][5].hash, bigProof, bigTree.root);
assert(bigVerified === true, '8叶子树proof验证通过');

// ── shortHash ──
console.log('--- shortHash ---');
assert(shortHash('abcdef1234567890', 4) === 'abcd...7890', 'shortHash截断正确');
assert(shortHash(null) === '—', 'null返回占位符');
assert(shortHash('') === '—', '空字符串返回占位符');

// ── 边界情况 ──
console.log('--- 边界情况 ---');
const tree1 = buildMerkleTreeSync(['solo']);
assert(tree1 === null || tree1.levels[0].length === 1, '单叶子树可处理');
assert(buildMerkleTreeSync([]) === null, '空数组返回null');
assert(buildMerkleTreeSync(null) === null, 'null输入返回null');

console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);

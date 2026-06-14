/**
 * 鹅腿 vs 鸭腿测试题目数据。
 *
 * 每题包含：
 * - id: 题目编号
 * - image: 图片路径（相对于本页面）
 * - answer: 正确答案 'goose' | 'duck'
 * - hint: 关键辨别提示
 * - explanation: 答案揭晓后的解释
 */
const QUIZ_DATA = [
  {
    id: 1,
    image: 'images/duck-1.jpeg',
    answer: 'duck',
    hint: '注意骨骼粗细和整体大小',
    explanation: '骨骼较细、腿围偏小，是鸭腿的典型特征。'
  },
  {
    id: 2,
    image: 'images/goose-1.jpeg',
    answer: 'goose',
    hint: '注意整体大小和肉量',
    explanation: '明显更粗大的腿型，骨骼粗壮，单根重量超200g，是鹅腿。'
  },
  {
    id: 3,
    image: 'images/duck-2.jpeg',
    answer: 'duck',
    hint: '看皮肤纹理和光泽',
    explanation: '皮肤细腻光滑，毛孔不明显，脂肪层薄，是鸭腿。'
  },
  {
    id: 4,
    image: 'images/goose-2.jpg',
    answer: 'goose',
    hint: '看肉量分布和骨关节',
    explanation: '肉量丰厚、关节处骨头粗大，这是鹅腿区别于鸭腿最直观的特征。'
  },
  {
    id: 5,
    image: 'images/duck-3.jpeg',
    answer: 'duck',
    hint: '注意长度和骨头比例',
    explanation: '腿部较短、骨头细，整体比例偏小，是鸭腿。'
  },
  {
    id: 6,
    image: 'images/goose-3.jpeg',
    answer: 'goose',
    hint: '看皮下脂肪层厚度',
    explanation: '鹅皮下脂肪层更厚实，皮肤毛孔粗大可见，是鹅腿。'
  },
  {
    id: 7,
    image: 'images/duck-4.jpeg',
    answer: 'duck',
    hint: '看烤后的色泽和大小',
    explanation: '鸭皮脂肪层薄，烤后更容易呈现均匀金黄色，体型偏小。'
  },
  {
    id: 8,
    image: 'images/duck-5.jpeg',
    answer: 'duck',
    hint: '对比骨骼和肉量',
    explanation: '骨头细、肉量相对少，整体纤细，是鸭腿的尺寸。'
  },
  {
    id: 9,
    image: 'images/duck-6.jpeg',
    answer: 'duck',
    hint: '看整体形状和皮肤',
    explanation: '体型修长但不粗壮，皮肤相对光滑细腻，是鸭腿。'
  },
  {
    id: 10,
    image: 'images/duck-7.jpeg',
    answer: 'duck',
    hint: '注意肉质纤维粗细',
    explanation: '肉质纤维较细、口感嫩滑，撕开后纹路细密，是鸭腿的特点。'
  }
];

/**
 * 评级规则
 */
const GRADE_RULES = [
  { min: 10, grade: '火眼金睛', color: '#ffd700', msg: '你比清华北大学生的鉴别力强多了！' },
  { min: 8, grade: '味觉侦探', color: '#81c784', msg: '不错！你大概率不会被鹅腿阿姨骗到。' },
  { min: 6, grade: '普通食客', color: '#90caf9', msg: '及格水平，但现实中可能还是会被忽悠。' },
  { min: 4, grade: '迷糊吃货', color: '#ce93d8', msg: '和大部分人差不多，分不太清很正常。' },
  { min: 0, grade: '鹅腿阿姨的理想客户', color: '#ff6b6b', msg: '别担心，清华北大学生也没比你强到哪去……' }
];

// 导出供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QUIZ_DATA, GRADE_RULES };
}

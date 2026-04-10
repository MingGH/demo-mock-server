// 游戏场景数据
const SCENARIOS = [
  {
    title: '某二线城市程序员月薪',
    desc: '调查成都、武汉等二线城市的程序员月薪（元）。',
    mean: 14500, std: 5500, unit: '元',
    sliderMin: 3000, sliderMax: 40000, sliderStep: 500,
    defaultGuess: 12000, defaultStd: 5000,
    stdMin: 1000, stdMax: 15000, stdStep: 500
  },
  {
    title: '大学生每天手机使用时间',
    desc: '调查某大学学生每天的手机屏幕使用时间（小时）。',
    mean: 6.2, std: 2.1, unit: '小时',
    sliderMin: 0, sliderMax: 16, sliderStep: 0.1,
    defaultGuess: 5, defaultStd: 2,
    stdMin: 0.5, stdMax: 6, stdStep: 0.1
  },
  {
    title: '一线城市二手房单价',
    desc: '某一线城市普通小区的二手房挂牌单价（元/㎡）。',
    mean: 52000, std: 12000, unit: '元/㎡',
    sliderMin: 10000, sliderMax: 120000, sliderStep: 1000,
    defaultGuess: 45000, defaultStd: 10000,
    stdMin: 2000, stdMax: 40000, stdStep: 1000
  },
  {
    title: '外卖从下单到送达的时间',
    desc: '午高峰时段，某平台外卖从下单到送达的时间（分钟）。',
    mean: 38, std: 11, unit: '分钟',
    sliderMin: 10, sliderMax: 90, sliderStep: 1,
    defaultGuess: 35, defaultStd: 10,
    stdMin: 2, stdMax: 30, stdStep: 1
  },
  {
    title: '知乎回答获赞数',
    desc: '随机抽取知乎某热门话题下的回答获赞数（赞）。',
    mean: 320, std: 180, unit: '赞',
    sliderMin: 0, sliderMax: 1500, sliderStep: 10,
    defaultGuess: 200, defaultStd: 150,
    stdMin: 20, stdMax: 500, stdStep: 10,
    minVal: 0
  },
  {
    title: '普通成年男性100米跑成绩',
    desc: '随机抽取非运动员成年男性的100米跑成绩（秒）。',
    mean: 14.2, std: 1.8, unit: '秒',
    sliderMin: 10, sliderMax: 22, sliderStep: 0.1,
    defaultGuess: 14, defaultStd: 2,
    stdMin: 0.5, stdMax: 5, stdStep: 0.1
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SCENARIOS };
}

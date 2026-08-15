/* self-funded-work 数据层
 * 只放图表数据，纯对象、无 DOM 操作、无副作用。
 * 由 app.js 读取渲染，做到数据与逻辑分离。
 */
window.SFW_DATA = {
  // 一个程序员的月度 AI 订阅账单（人民币，1 美元 ≈ 7.2 元）
  bill: {
    labels: ['GitHub Copilot', 'ChatGPT Plus', 'Claude Pro', 'Cursor Pro'],
    shortLabels: ['Copilot', 'ChatGPT', 'Claude', 'Cursor'],
    values: [72, 145, 145, 145]
  },
  // 谁掏钱，谁干活：不同付费方式下，把 AI 用于工作的比例
  epochai: {
    labels: ['公司买单', '自费订阅', '免费用户'],
    values: [76, 58, 38]
  },
  // 公司不买，员工自费
  nanda: {
    labels: ['员工用个人工具', '自带 AI 未获报销', '公司买了官方订阅'],
    values: [90, 78, 40]
  },
  // 用的人多了，信的人少了
  stack: {
    labels: ['正在使用 AI 工具', '相信 AI 输出准确'],
    values: [84, 29]
  }
};

# 🚀 Demo Collection

一个技术演示合集，用可视化和交互的方式解释编程概念、算法原理和生活中的数学问题。

## 🌐 在线预览

**主站：** https://numfeel.996.ninja

**后端 API：** https://demo-api-mockserver.runnable.run

## 📋 演示列表

### 💻 编程概念
- **[同步 vs 异步演示](https://numfeel.996.ninja/sync-async-demo.html)** - 通过动画直观理解同步与异步的区别
- **[IndexedDB 缓存分页](https://numfeel.996.ninja/mock-data.html)** - 大数据量的本地缓存与分页展示

### 💰 金融计算
- **[财务决策风险模拟](https://numfeel.996.ninja/financial-risk-simulator.html)** - 蒙特卡洛模拟分析消费风险
- **[复利计算器](https://numfeel.996.ninja/compound-interest-calculator.html)** - 可视化复利增长效果
- **[基金定投模拟](https://numfeel.996.ninja/fund-dca-simulator.html)** - 定投策略收益分析
- **[财务自由计算器](https://numfeel.996.ninja/financial-freedom-calculator.html)** - 计算达到财务自由所需时间
- **[存100万有多难](https://numfeel.996.ninja/save-million-calculator.html)** - 打工人攒钱真相计算器
- **[200万 vs 2亿](https://numfeel.996.ninja/200w-vs-2yi.html)** - 期望值与风险偏好的博弈

### 🎲 概率统计
- **[蒙提霍尔问题](https://numfeel.996.ninja/monty-hall-simulator.html)** - 三门问题的概率验证
- **[101 vs 100 硬币问题](https://numfeel.996.ninja/coin-flip-probability.html)** - 对称性证明+蒙特卡洛模拟
- **[泊松分布可视化](https://numfeel.996.ninja/poisson-distribution.html)** - 交互式理解泊松分布的本质
- **[50%财富按钮悖论](https://numfeel.996.ninja/wealth-button-paradox.html)** - 期望值陷阱的模拟揭示
- **[赌徒破产悖论](https://numfeel.996.ninja/gambler-ruin.html)** - 随机游走的残酷真相
- **[武器伤害对比](https://numfeel.996.ninja/weapon-damage-compare.html)** - 期望相同但方差不同的取舍
- **[100面骰子：1.1%有多低](https://numfeel.996.ninja/drug-relapse-dice.html)** - 感受1%概率的渺茫

### ⚛️ 量子物理
- **[量子随机数可视化](https://numfeel.996.ninja/quantum-random-visualizer.html)** - 真随机 vs 伪随机对比
- **[量子大乐透](https://numfeel.996.ninja/quantum-lottery.html)** - 用量子真随机数生成彩票号码

### 🧠 心理学 & 哲学
- **[忒修斯之船](https://numfeel.996.ninja/ship-of-theseus.html)** - 身份认同的经典思想实验
- **[损失厌恶测试](https://numfeel.996.ninja/loss-aversion.html)** - 测测你的损失厌恶系数

### �️ 实用工具
- **[随机中文名生成](https://numfeel.996.ninja/chinese-names.html)** - 批量生成测试用中文姓名
- **[数据大小可视化](https://numfeel.996.ninja/data-size-visualizer.html)** - 直观展示不同数据单位的大小关系
- **[圣诞帽头像生成器](https://numfeel.996.ninja/christmas-hat.html)** - 上传头像添加圣诞贴图
- **[墓志铭生成器](https://numfeel.996.ninja/tombstone-generator.html)** - 生成你的专属墓碑图片

### � 安全 & 监控
- **[全球SSH攻击地图](https://numfeel.996.ninja/ssh-attack-map.html)** - 实时展示服务器被扫描的IP来源

### 🎭 趣味 & 娱乐
- **[AI颜值评分器](https://numfeel.996.ninja/face-score.html)** - AI分析面部比例给出颜值分数
- **[户晨风直播词云](https://numfeel.996.ninja/word-cloud.html)** - 直播实录数据生成的词云图

## 🎯 项目目标

通过交互式演示回答知乎上的技术问题，让复杂概念变得易懂。

## 🔧 技术栈

- **后端：** Java 17 + Vert.x 4.5
- **前端：** 原生 HTML/CSS/JavaScript + Chart.js
- **数据：** MaxMind GeoIP2 (IP地理定位)、结巴分词
- **部署：** Docker + K3s

## 📁 项目结构

```
├── pages/                  # 前端演示页面
├── components/             # 公共组件
├── images/                 # 静态资源
├── data/                   # 数据文件 (GeoLite2 等)
├── src/main/java/          # 后端 Java 代码
│   └── com/example/demo_mock_server/
│       ├── handler/        # API 处理器
│       ├── service/        # 业务服务
│       ├── generator/      # 数据生成器
│       └── config/         # 配置类
├── Dockerfile              # Docker 构建文件
├── k3s-deployment-prod.yaml # K3s 部署配置
└── pom.xml                 # Maven 配置
```

## 🚀 本地运行

```bash
# 编译打包
./mvnw clean package

# 运行
java -jar target/demo-mock-server-1.0.0-SNAPSHOT-fat.jar
```

## 👤 作者

**知乎：** [@Asher](https://www.zhihu.com/people/han-ming-45-96)

欢迎关注我的知乎，查看更多技术问答和演示！

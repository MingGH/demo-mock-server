# Eclipse Temurin 25（HotSpot，LTS）。与文章使用的 G1 / ZGC 等 HotSpot 概念保持一致，
# 也让 /jvm-memory 返回的 GC 名与内存池（Metaspace / Code Cache）对得上。
FROM eclipse-temurin:25-jre

ARG JAR_FILE=target/numfeel-service-0.0.1-SNAPSHOT.jar
# trace-agent 由 CI 先行构建并拷入 numfeel-service/target/（见 deploy.yml）
ARG AGENT_FILE=target/trace-agent.jar
ENV PROJECT_HOME=/usr/local/numfeel-service

RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
RUN echo 'Asia/Shanghai' >/etc/timezone
RUN mkdir -p $PROJECT_HOME && mkdir -p $PROJECT_HOME/data

WORKDIR $PROJECT_HOME
COPY ${JAR_FILE} $PROJECT_HOME/numfeel-service.jar
COPY ${AGENT_FILE} $PROJECT_HOME/trace-agent.jar

EXPOSE 8080

# 后端 API 服务（numfeel-api.996.ninja）。
# - 数据库连接信息通过环境变量注入：MYSQL_HOST/PORT/DB/USER/PASSWORD
# - 上游统计接口 token：NINJA_API_TOKEN
# - 运行时数据目录（HuChenFeng 词云语料）自动下载到 ./data
# - 静态前端（pages/components）单独部署在 numfeel.996.ninja，本服务默认不托管；
# - -javaagent 挂载 trace-agent：业务代码零改动，采集方法调用事件流，
#   经 GET /agent/events、/agent/stats（AgentTraceController 回环转发）对外暴露
ENTRYPOINT ["java", "-Xms384m", "-Xmx768m", "-javaagent:/usr/local/numfeel-service/trace-agent.jar", "-jar", "/usr/local/numfeel-service/numfeel-service.jar"]

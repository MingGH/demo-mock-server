FROM ibm-semeru-runtimes:open-17-jre

ARG JAR_FILE=target/numfeel-service-0.0.1-SNAPSHOT.jar
ENV PROJECT_HOME=/usr/local/numfeel-service

RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
RUN echo 'Asia/Shanghai' >/etc/timezone
RUN mkdir -p $PROJECT_HOME && mkdir -p $PROJECT_HOME/data

WORKDIR $PROJECT_HOME
COPY ${JAR_FILE} $PROJECT_HOME/numfeel-service.jar

EXPOSE 8080

# 后端 API 服务（numfeel-api.996.ninja）。
# - 数据库连接信息通过环境变量注入：MYSQL_HOST/PORT/DB/USER/PASSWORD
# - 上游统计接口 token：NINJA_API_TOKEN
# - 运行时数据目录（GeoLite2 / HuChenFeng）自动下载到 ./data
# - 静态前端（pages/components）单独部署在 numfeel.996.ninja，本服务默认不托管；
#   如需本服务托管，可挂载目录并设置 static.pages-location / static.components-location
ENTRYPOINT ["java", "-Xms256m", "-Xmx600m", "-jar", "/usr/local/numfeel-service/numfeel-service.jar"]

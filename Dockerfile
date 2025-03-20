FROM azul/zulu-openjdk:17.0.13

ARG JAR_NAME
ENV PROJECT_NAME ${JAR_NAME}
ENV PROJECT_HOME /usr/local/${PROJECT_NAME}


RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
RUN echo 'Asia/Shanghai' >/etc/timezone
RUN mkdir -p $PROJECT_HOME && mkdir -p $PROJECT_HOME/logs

ARG JAR_FILE
COPY ${JAR_FILE} $PROJECT_HOME/${JAR_NAME}.jar

ENTRYPOINT java -Xms256m -Xmx256m -jar $PROJECT_HOME/$PROJECT_NAME.jar

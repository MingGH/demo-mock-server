package com.example.demo_mock_server;

import com.github.javafaker.Faker;
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.http.HttpServerResponse;
import io.vertx.core.json.JsonObject;
import io.vertx.ext.web.Router;
import io.vertx.ext.web.handler.CorsHandler;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.stream.IntStream;

public class MainVerticle extends AbstractVerticle {

  private static final Faker FAKER = new Faker();

  @Override
  public void start() {
    Router router = Router.router(vertx);
    // 允许跨域请求
    router.route().handler(CorsHandler.create("*")  // 允许所有域名访问
      .allowedMethod(io.vertx.core.http.HttpMethod.GET)
      .allowedMethod(io.vertx.core.http.HttpMethod.POST)
      .allowedMethod(io.vertx.core.http.HttpMethod.PUT)
      .allowedMethod(io.vertx.core.http.HttpMethod.DELETE)
      .allowedHeader("Content-Type")
      .allowedHeader("Authorization")
      .allowedHeader("Accept")
      .allowedHeader("Origin"));



    router.get("/mock")
      .handler(routerCtx -> {
        HttpServerRequest req = routerCtx.request();
        if ("/mock".equals(req.path()) && req.method().name().equalsIgnoreCase("GET")) {
          String nParam = req.getParam("n");

          if (nParam == null || !nParam.matches("\\d+") || Integer.parseInt(nParam) < 200 || Integer.parseInt(nParam) > 100_0000) {
            req.response().setStatusCode(400).end("Invalid parameter 'n' (200 <= n <= 100_0000)");
            return;
          }

          int n = Integer.parseInt(nParam);
          long start = System.currentTimeMillis();

          HttpServerResponse response = req.response();
          response.putHeader("Content-Type", "application/json")
            .setChunked(true)
            .write("[");  // JSON 数组开始

          generateFakeData(n)
            .index()  // 为每个元素附加索引
            .doOnNext(tuple -> {
              long idx = tuple.getT1();
              String person = tuple.getT2().encode();

              // 判断是否为最后一个元素
              if (idx == n - 1) {
                response.write(person);  // 最后一个元素后不加逗号
              } else {
                response.write(person + ",");
              }
            })
            .doOnError(err -> {
              response.setStatusCode(500).end("Error: " + err.getMessage());
            })
            .doOnComplete(() -> {
              long duration = System.currentTimeMillis() - start;
              System.out.println("Generated " + n + " records in " + duration + " ms");

              response.end("]");  // 补上结束的括号
            })
            .subscribe();
        } else {
          req.response().setStatusCode(404).end("Not Found");
        }
      });


    vertx.createHttpServer()
      .requestHandler(router)
      .listen(8080, res -> {
        if (res.succeeded()) {
          System.out.println("Server started on port 8080, http://localhost:8080/mock?n=2000");
        } else {
          System.err.println("Failed to start server: " + res.cause().getMessage());
        }
      });
  }

  /**
   * 并行生成假数据
   */
  private Flux<JsonObject> generateFakeData(int total) {
    int parallelism = Math.min(8, Runtime.getRuntime().availableProcessors());

    return Flux.range(0, total)
      .parallel(parallelism)                            // 并行生成
      .runOn(Schedulers.boundedElastic())               // 使用弹性线程池
      .flatMap(it -> Mono.fromCallable(() -> {
        return new JsonObject()
          .put("id", it)
          .put("name", FAKER.name().fullName())
          .put("email", FAKER.internet().emailAddress())
          .put("phone", FAKER.phoneNumber().cellPhone())
          .put("address", FAKER.address().fullAddress())
          .put("company", FAKER.company().name())
          .put("dob", FAKER.date().birthday(18, 65).toString())
          .put("job", FAKER.job().title());
      }))
      .sequential();
  }


  public static void main(String[] args) {
    Vertx vertx = Vertx.vertx();
    vertx.deployVerticle(new MainVerticle());
  }
}

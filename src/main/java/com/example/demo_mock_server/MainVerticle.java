package com.example.demo_mock_server;

import com.github.javafaker.Faker;
import io.vertx.core.AbstractVerticle;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServerResponse;
import io.vertx.core.json.JsonObject;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.stream.IntStream;

public class MainVerticle extends AbstractVerticle {

  private static final Faker FAKER = new Faker();

  @Override
  public void start() {
    vertx.createHttpServer()
      .requestHandler(req -> {
        if ("/mock".equals(req.path()) && req.method().name().equalsIgnoreCase("GET")) {
          String nParam = req.getParam("n");

          if (nParam == null || !nParam.matches("\\d+") || Integer.parseInt(nParam) < 2000 || Integer.parseInt(nParam) > 100_0000) {
            req.response().setStatusCode(400).end("Invalid parameter 'n' (2000 <= n <= 100_0000)");
            return;
          }

          int n = Integer.parseInt(nParam);
          long start = System.currentTimeMillis();

          HttpServerResponse response = req.response();
          response.putHeader("Content-Type", "application/json")
            .setChunked(true)
            .write("[");  // JSON 数组开始

          generateFakeData(n)
            .doOnNext(person -> response.write(person.encode() + ","))
            .doOnError(err -> {
              response.setStatusCode(500).end("Error: " + err.getMessage());
            })
            .doOnComplete(() -> {
              long duration = System.currentTimeMillis() - start;
              System.out.println("Generated " + n + " records in " + duration + " ms");

              // 去掉最后一个逗号并关闭 JSON 数组
              response.end("]");
            })
            .subscribe();
        } else {
          req.response().setStatusCode(404).end("Not Found");
        }
      })
      .listen(8080, res -> {
        if (res.succeeded()) {
          System.out.println("Server started on port 8080");
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

package run.runnable.numfeelservice.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import run.runnable.numfeelservice.service.AvatarConvertService;
import run.runnable.numfeelservice.web.ApiException;
import run.runnable.numfeelservice.web.GlobalExceptionHandler;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * AvatarConvertController HTTP 层测试，mock 转换服务。
 */
class AvatarConvertControllerTest {

    private AvatarConvertService service;
    private WebTestClient client;

    @BeforeEach
    void setUp() {
        service = mock(AvatarConvertService.class);
        client = WebTestClient.bindToController(new AvatarConvertController(service))
                .controllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void convert_valid_gif_returns_webp_bytes() {
        byte[] fakeWebp = {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'};
        when(service.gifToAnimatedWebp(any())).thenReturn(Mono.just(fakeWebp));

        client.post().uri("/avatar/convert-webp")
                .contentType(org.springframework.http.MediaType.valueOf("image/gif"))
                .bodyValue(new byte[]{'G', 'I', 'F', '8', '9', 'a'})
                .exchange()
                .expectStatus().isOk()
                .expectHeader().contentType("image/webp")
                .expectBody(byte[].class).isEqualTo(fakeWebp);
    }

    @Test
    void convert_wrong_content_type_returns_415() {
        client.post().uri("/avatar/convert-webp")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .bodyValue("{}")
                .exchange()
                .expectStatus().isEqualTo(415);
    }

    @Test
    void convert_oversize_returns_413() {
        when(service.gifToAnimatedWebp(any()))
                .thenReturn(Mono.error(new ApiException(413, "gif 超过 20MB，请先压缩再试")));

        client.post().uri("/avatar/convert-webp")
                .contentType(org.springframework.http.MediaType.valueOf("image/gif"))
                .bodyValue(new byte[]{'G', 'I', 'F', '8', '9', 'a'})
                .exchange()
                .expectStatus().isEqualTo(413)
                .expectBody()
                .jsonPath("$.status").isEqualTo(413);
    }

    @Test
    void convert_broken_gif_returns_422() {
        when(service.gifToAnimatedWebp(any()))
                .thenReturn(Mono.error(new ApiException(422, "gif 解析失败，文件可能损坏")));

        client.post().uri("/avatar/convert-webp")
                .contentType(org.springframework.http.MediaType.valueOf("image/gif"))
                .bodyValue(new byte[]{'G', 'I', 'F', '8', '9', 'a'})
                .exchange()
                .expectStatus().isEqualTo(422)
                .expectBody()
                .jsonPath("$.status").isEqualTo(422);
    }
}

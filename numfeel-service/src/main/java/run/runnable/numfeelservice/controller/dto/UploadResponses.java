package run.runnable.numfeelservice.controller.dto;

import java.util.List;
import java.util.Map;

/**
 * multipart/form-data 上传演示的响应 DTO（Java record）。
 */
public final class UploadResponses {

    private UploadResponses() {
    }

    /**
     * 服务端按 boundary 解包后得到的单个文件信息。
     *
     * @param fieldName   该 part 的 Content-Disposition.name（表单字段名）
     * @param filename    该 part 的 Content-Disposition.filename（客户端原始文件名）
     * @param contentType 该 part 的 Content-Type
     * @param size        part 负载的实际字节数
     */
    public record UploadFile(String fieldName, String filename, String contentType, long size) {
    }

    /**
     * 一次 multipart 上传的解析汇总结果。
     *
     * @param uploadId        本次上传的服务端临时目录标识
     * @param fileCount       成功解析的文件个数
     * @param totalBytes      所有文件负载的字节总数
     * @param expiresInSeconds 临时文件保留多少秒后自动删除
     * @param fields          表单普通字段 name → value（非文件 part）
     * @param files           解包后的文件列表
     */
    public record UploadSummary(
            String uploadId,
            int fileCount,
            long totalBytes,
            long expiresInSeconds,
            Map<String, String> fields,
            List<UploadFile> files) {
    }
}
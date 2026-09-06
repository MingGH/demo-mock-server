package run.runnable.traceagent;

/**
 * 一次方法调用的事件记录。
 *
 * @param seq            全局递增序号，前端拿它做增量拉取游标
 * @param epochMs        事件完成时刻（墙钟）
 * @param type           类简名，如 {@code JvmMemoryController}
 * @param method         方法名，如 {@code snapshot}
 * @param depth          同线程嵌套深度（0 为最外层）
 * @param durationMicros 方法体耗时（微秒）
 * @param threadName     执行线程名（反应式服务里这就是「工作现场」）
 * @param error          方法体是否抛出异常
 */
public record Event(long seq,
                    long epochMs,
                    String type,
                    String method,
                    int depth,
                    long durationMicros,
                    String threadName,
                    boolean error) {
}

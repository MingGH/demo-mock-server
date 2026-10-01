/**
 * nativebench - 跨界收费站基准用的真实 C++ 共享库
 *
 * 三个导出函数对应三条车道：
 *   nb_get_at    单元素读：Java 侧每个元素都要调一次（每次调用都过收费站）
 *   nb_sum_range 攒批过境：一次调用，C++ 内部把整段循环干完
 *   nb_noop      纯过路费：什么都不干，专门量 FFM 边界本身的开销
 *
 * 刻意只用最朴素的指针和循环——这个文件的存在意义就是"没有被 JIT 魔改过的机器码"，
 * 任何"聪明"的优化都会污染测量。
 */
#include <cstdint>

extern "C" {

int32_t nb_get_at(const int32_t* arr, int32_t index) {
    return arr[index];
}

int64_t nb_sum_range(const int32_t* arr, int32_t start, int32_t end) {
    int64_t acc = 0;
    for (int32_t i = start; i < end; i++) {
        acc += arr[i];
    }
    return acc;
}

void nb_noop() {
}

int32_t nb_version() {
    return 1;
}

}

FROM ubuntu:22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl xz-utils gcc make libc6-dev binutils python3 ca-certificates unzip \
    && rm -rf /var/lib/apt/lists/*

# QuickJS (AOT compiler qjsc + runtime qjs + headers)
RUN curl -fsSL https://bellard.org/quickjs/quickjs-2024-01-13.tar.xz | tar xJ \
    && cd quickjs-2024-01-13 \
    && make -j$(nproc) \
    && make install \
    && cp qjsc /usr/local/bin/ \
    && cd .. && rm -rf quickjs-2024-01-13

# Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Node.js 22 + pkg
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pkg@5.8.1

WORKDIR /workspace
COPY test-sample.js /workspace/

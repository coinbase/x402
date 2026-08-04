FROM ghcr.io/ggerganov/llama.cpp:server-cuda

COPY arkhe-os.gguf /models/arkhe-os.gguf

ENV ARKHE_GGUF_PATH=/models/arkhe-os.gguf
ENV ARKHE_CONTEXT=32768
ENV ARKHE_THREADS=8
ENV ARKHE_PORT=8080
ENV CUDA_VISIBLE_DEVICES=0

EXPOSE 8080

CMD ["/server", "-m", "/models/arkhe-os.gguf", "-c", "32768", "-t", "8", "--port", "8080", "--host", "0.0.0.0"]
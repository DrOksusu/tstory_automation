# Node.js + Puppeteer 기반 이미지
FROM node:20-slim

# Puppeteer를 위한 Chrome 의존성 설치
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    fonts-noto-cjk \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer가 설치된 Chromium 사용하도록 설정
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 작업 디렉토리 설정
WORKDIR /app

# 백엔드 폴더의 패키지 파일 복사 및 설치 (devDependencies 포함 - 빌드용)
COPY tstory_backend/package*.json ./
RUN npm ci

# 소스 코드 복사
COPY tstory_backend/src ./src/
COPY tstory_backend/tsconfig.json ./

# Prisma 스키마 복사 및 생성
COPY tstory_backend/prisma ./prisma/
RUN npx prisma generate

# TypeScript 빌드
RUN npm run build

# 쿠키 저장용 디렉토리 생성
RUN mkdir -p /app/cookies

# 포트 설정
EXPOSE 3020

# 앱 실행
CMD ["node", "dist/app.js"]

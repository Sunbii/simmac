# Node.js 공식 이미지 사용
FROM node:18-alpine

# 작업 디렉토리 설정
WORKDIR /app

# package.json과 package-lock.json 복사
COPY backend/package*.json ./

# 의존성 설치
RUN npm ci --only=production

# 애플리케이션 코드 복사
COPY backend/src ./src
COPY frontend ./frontend

# 포트 노출
EXPOSE 3000

# 애플리케이션 실행
CMD ["npm", "start"]

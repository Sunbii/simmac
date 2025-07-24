import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// 연결된 클라이언트들을 저장
const clients = new Map<string, { ws: WebSocket, profile: any }>();

// 정적 파일 서빙 (프론트엔드)
app.use(express.static(path.join(__dirname, '../../frontend')));

// WebSocket 연결 처리
wss.on('connection', (ws: WebSocket) => {
  console.log('새 클라이언트 연결됨');
  
  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);
      console.log('받은 메시지:', data);
      
      switch (data.type) {
        case 'register':
          // 클라이언트 등록
          clients.set(data.userId, { ws, profile: data.profile });
          ws.send(JSON.stringify({ type: 'registered', userId: data.userId }));
          break;
          
        case 'search':
          // 사용자 검색
          const searchResults = Array.from(clients.entries())
            .filter(([id, client]) => 
              id !== data.userId && 
              client.profile.name.toLowerCase().includes(data.query.toLowerCase())
            )
            .map(([id, client]) => ({ userId: id, profile: client.profile }));
          
          ws.send(JSON.stringify({ 
            type: 'searchResults', 
            results: searchResults 
          }));
          break;
          
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          // WebRTC 시그널링 메시지 전달
          const targetClient = clients.get(data.targetUserId);
          if (targetClient) {
            targetClient.ws.send(JSON.stringify({
              ...data,
              fromUserId: data.userId
            }));
          }
          break;
          
        case 'call-request':
          // 통화 요청
          const callTarget = clients.get(data.targetUserId);
          if (callTarget) {
            callTarget.ws.send(JSON.stringify({
              type: 'incoming-call',
              fromUserId: data.userId,
              fromProfile: data.fromProfile,
              callType: data.callType
            }));
          }
          break;
          
        case 'call-response':
          // 통화 응답
          const caller = clients.get(data.targetUserId);
          if (caller) {
            caller.ws.send(JSON.stringify({
              type: 'call-response',
              fromUserId: data.userId,
              accepted: data.accepted
            }));
          }
          break;
      }
    } catch (error) {
      console.error('메시지 처리 오류:', error);
    }
  });
  
  ws.on('close', () => {
    // 연결 종료 시 클라이언트 제거
    for (const [userId, client] of clients.entries()) {
      if (client.ws === ws) {
        clients.delete(userId);
        console.log(`클라이언트 ${userId} 연결 해제됨`);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다`);
});

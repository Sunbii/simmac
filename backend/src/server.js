const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// 연결된 클라이언트들을 저장
const clients = new Map();

// 차단 관계를 저장 (userId -> Set of blocked userIds)
const blockedRelations = new Map();

// 사용자 차단
function blockUser(blockerId, blockedId) {
  if (!blockedRelations.has(blockerId)) {
    blockedRelations.set(blockerId, new Set());
  }
  blockedRelations.get(blockerId).add(blockedId);
  console.log(`${blockerId}가 ${blockedId}를 차단했습니다`);
}

// 사용자 차단 해제
function unblockUser(blockerId, blockedId) {
  if (blockedRelations.has(blockerId)) {
    blockedRelations.get(blockerId).delete(blockedId);
    console.log(`${blockerId}가 ${blockedId}를 차단 해제했습니다`);
  }
}

// 차단 상태 확인
function isBlocked(blockerId, blockedId) {
  return blockedRelations.has(blockerId) && blockedRelations.get(blockerId).has(blockedId);
}

// 온라인 사용자 목록을 모든 클라이언트에게 브로드캐스트
function broadcastOnlineUsers() {
  const onlineUsers = Array.from(clients.entries()).map(([userId, client]) => ({
    userId,
    profile: client.profile
  }));
  
  const message = JSON.stringify({
    type: 'onlineUsers',
    users: onlineUsers
  });
  
  // 모든 연결된 클라이언트에게 전송
  clients.forEach((client) => {
    if (client.ws.readyState === 1) { // WebSocket.OPEN
      client.ws.send(message);
    }
  });
  
  console.log(`온라인 사용자 목록 브로드캐스트: ${onlineUsers.length}명`);
}

// 정적 파일 서빙 (프론트엔드)
app.use(express.static(path.join(__dirname, '../../frontend')));

// WebSocket 연결 처리
wss.on('connection', (ws) => {
  console.log('새 클라이언트 연결됨');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('받은 메시지:', data);
      
      switch (data.type) {
        case 'register':
          // 클라이언트 등록
          clients.set(data.userId, { ws, profile: data.profile });
          ws.send(JSON.stringify({ type: 'registered', userId: data.userId }));
          console.log(`클라이언트 등록됨: ${data.userId}`);
          
          // 모든 클라이언트에게 온라인 사용자 목록 브로드캐스트
          broadcastOnlineUsers();
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
          console.log(`검색 결과: ${searchResults.length}개`);
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
            console.log(`시그널링 메시지 전달: ${data.type}`);
          }
          break;
          
        case 'call-request':
          // 통화 요청 - 차단 상태 확인
          const callTarget = clients.get(data.targetUserId);
          if (callTarget) {
            // 수신자가 발신자를 차단했는지 확인
            if (isBlocked(data.targetUserId, data.userId)) {
              // 차단된 사용자에게 거절 응답 전송
              ws.send(JSON.stringify({
                type: 'call-response',
                fromUserId: data.targetUserId,
                accepted: false,
                blocked: true,
                reason: 'blocked'
              }));
              console.log(`차단된 사용자의 통화 요청 거절: ${data.userId} -> ${data.targetUserId}`);
            } else {
              // 차단되지 않은 경우 정상적으로 통화 요청 전달
              callTarget.ws.send(JSON.stringify({
                type: 'incoming-call',
                fromUserId: data.userId,
                fromProfile: data.fromProfile,
                callType: data.callType,
                callMode: data.callMode || 'normal' // 통화 모드 정보 전달
              }));
              console.log(`통화 요청 전달: ${data.callType}, 모드: ${data.callMode || 'normal'}`);
            }
          }
          break;
          
        case 'call-response':
          // 통화 응답
          const caller = clients.get(data.targetUserId);
          if (caller) {
            // 거절 시 차단 정보가 있으면 서버에 저장
            if (!data.accepted && data.blocked) {
              blockUser(data.userId, data.targetUserId);
            }
            
            caller.ws.send(JSON.stringify({
              type: 'call-response',
              fromUserId: data.userId,
              accepted: data.accepted,
              blocked: data.blocked
            }));
            console.log(`통화 응답 전달: ${data.accepted ? '수락' : '거절'}`);
          }
          break;
          
        case 'unblock-user':
          // 사용자 차단 해제
          unblockUser(data.userId, data.targetUserId);
          
          // 차단 해제된 사용자에게 알림
          const unblockedUser = clients.get(data.targetUserId);
          if (unblockedUser) {
            unblockedUser.ws.send(JSON.stringify({
              type: 'user-unblocked',
              fromUserId: data.userId
            }));
          }
          break;
          
        case 'reject-one-way-call':
          // 일방향 통화 거절
          if (data.blocked) {
            blockUser(data.userId, data.targetUserId);
          }
          
          // 요청자에게 거절 알림
          const oneWayCaller = clients.get(data.targetUserId);
          if (oneWayCaller) {
            oneWayCaller.ws.send(JSON.stringify({
              type: 'reject-one-way-call',
              fromUserId: data.userId,
              blocked: data.blocked
            }));
          }
          break;
          
        case 'accept-speaking':
          // 일단 들음 모드에서 말하기 수락
          const acceptTarget = clients.get(data.targetUserId);
          if (acceptTarget) {
            acceptTarget.ws.send(JSON.stringify({
              type: 'accept-speaking',
              fromUserId: data.userId
            }));
            console.log(`말하기 수락 알림 전달: ${data.userId} -> ${data.targetUserId}`);
          }
          break;
          
        case 'reject-speaking':
          // 일단 들음 모드에서 말하기 거절
          if (data.blocked) {
            blockUser(data.userId, data.targetUserId);
            console.log(`말하기 거절로 인한 차단: ${data.userId} -> ${data.targetUserId}`);
          }
          
          // 요청자에게 거절 알림
          const rejectSpeakingTarget = clients.get(data.targetUserId);
          if (rejectSpeakingTarget) {
            rejectSpeakingTarget.ws.send(JSON.stringify({
              type: 'reject-speaking',
              fromUserId: data.userId,
              blocked: data.blocked
            }));
          }
          break;
          
        case 'call-ended':
          // 통화 종료 알림 전달
          const callEndTarget = clients.get(data.targetUserId);
          if (callEndTarget) {
            callEndTarget.ws.send(JSON.stringify({
              type: 'call-ended',
              fromUserId: data.userId
            }));
            console.log(`통화 종료 알림 전달: ${data.userId} -> ${data.targetUserId}`);
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
        
        // 모든 클라이언트에게 온라인 사용자 목록 브로드캐스트
        broadcastOnlineUsers();
        break;
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket 오류:', error);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다`);
  console.log(`브라우저에서 http://localhost:${PORT} 접속하세요`);
});

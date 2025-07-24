class P2PMessenger {
    constructor() {
        this.ws = null;
        this.userId = null;
        this.userProfile = null;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.dataChannel = null;
        this.currentCall = null;
        this.contacts = new Set();
        this.onlineUsers = new Map(); // 온라인 사용자 목록 저장
        
        // 통화 모드 시스템
        this.callMode = 'normal'; // 'listen-first', 'listen-only', 'normal'
        this.blockedUsers = new Set(); // 거절로 인해 차단된 사용자 목록
        this.rejectedByMe = new Set(); // 내가 거절한 사용자 목록
        
        this.init();
    }

    
    init() {
        this.loadProfile();
        this.setupEventListeners();
        this.connectToSignalingServer();
    }
    
    // 프로필 관리
    loadProfile() {
        const savedProfile = localStorage.getItem('userProfile');
        if (savedProfile) {
            this.userProfile = JSON.parse(savedProfile);
            this.userId = this.generateUserId();
            this.showMainScreen();
        } else {
            this.showProfileSetup();
        }
    }
    
    generateUserId() {
        // 디바이스 정보를 기반으로 고유 ID 생성
        const deviceInfo = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenResolution: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
        
        const deviceString = JSON.stringify(deviceInfo);
        return this.hashCode(deviceString).toString();
    }
    
    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit integer로 변환
        }
        return Math.abs(hash);
    }
    
    saveProfile(name, bio) {
        this.userProfile = { name, bio };
        localStorage.setItem('userProfile', JSON.stringify(this.userProfile));
        this.userId = this.generateUserId();
        this.showMainScreen();
        this.registerWithServer();
    }
    
    // UI 관리
    showProfileSetup() {
        document.getElementById('profileSetup').classList.remove('hidden');
        document.getElementById('mainScreen').classList.add('hidden');
        document.getElementById('callScreen').classList.add('hidden');
    }
    
    showMainScreen() {
        document.getElementById('profileSetup').classList.add('hidden');
        document.getElementById('mainScreen').classList.remove('hidden');
        document.getElementById('callScreen').classList.add('hidden');
        
        if (this.userProfile) {
            document.getElementById('currentUserName').textContent = this.userProfile.name;
        }
    }
    
    showCallScreen() {
        document.getElementById('profileSetup').classList.add('hidden');
        document.getElementById('mainScreen').classList.add('hidden');
        document.getElementById('callScreen').classList.remove('hidden');
        
        // 통화 타입에 따라 비디오 컴테이너 표시/숨김
        const videoContainer = document.querySelector('.video-container');
        const callType = this.currentCall ? this.currentCall.callType : 'video';
        
        if (callType === 'chat') {
            videoContainer.style.display = 'none';
            document.getElementById('callTitle').textContent = '채팅 중';
        } else {
            videoContainer.style.display = 'block';
            document.getElementById('callTitle').textContent = '통화 중';
        }
    }
    
    // 이벤트 리스너 설정
    setupEventListeners() {
        // 프로필 저장
        document.getElementById('saveProfile').addEventListener('click', () => {
            const name = document.getElementById('userName').value.trim();
            const bio = document.getElementById('userBio').value.trim();
            
            if (name) {
                this.saveProfile(name, bio);
            } else {
                alert('이름을 입력해주세요.');
            }
        });
        
        // 프로필 수정
        document.getElementById('editProfile').addEventListener('click', () => {
            document.getElementById('userName').value = this.userProfile.name;
            document.getElementById('userBio').value = this.userProfile.bio;
            this.showProfileSetup();
        });
        
        // 사용자 검색
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.searchUsers();
        });
        
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchUsers();
            }
        });
        
        // 통화 제어
        document.getElementById('toggleVideo').addEventListener('click', () => {
            this.toggleVideo();
        });
        
        document.getElementById('toggleAudio').addEventListener('click', () => {
            this.toggleAudio();
        });
        
        document.getElementById('endCall').addEventListener('click', () => {
            this.endCall();
        });
        
        // 채팅
        document.getElementById('sendMessage').addEventListener('click', () => {
            this.sendChatMessage();
        });
        
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
        
        // 수신 통화 응답
        document.getElementById('acceptCall').addEventListener('click', () => {
            this.acceptIncomingCall();
        });
        
        document.getElementById('rejectCall').addEventListener('click', () => {
            this.rejectIncomingCall();
        });
        
        // 통화 모드 라디오 버튼
        document.querySelectorAll('input[name="callMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.callMode = e.target.value;
                    console.log('통화 모드 변경:', this.callMode);
                }
            });
        });
        
        // 일방향 통화 거절
        document.getElementById('rejectOneWayCall').addEventListener('click', () => {
            this.rejectOneWayCall();
        });
        
        // 초기 차단된 사용자 목록 표시
        this.displayBlockedUsers();
    }
    
    // 시그널링 서버 연결
    connectToSignalingServer() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('시그널링 서버에 연결됨');
            if (this.userProfile) {
                this.registerWithServer();
            }
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleSignalingMessage(data);
        };
        
        this.ws.onclose = () => {
            console.log('시그널링 서버 연결 끊어짐');
            // 재연결 시도
            setTimeout(() => this.connectToSignalingServer(), 3000);
        };
    }
    
    registerWithServer() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'register',
                userId: this.userId,
                profile: this.userProfile
            }));
        }
    }
    
    // 시그널링 메시지 처리
    handleSignalingMessage(data) {
        console.log('시그널링 메시지:', data);
        
        switch (data.type) {
            case 'registered':
                console.log('서버에 등록됨:', data.userId);
                break;
                
            case 'searchResults':
                this.displaySearchResults(data.results);
                break;
                
            case 'incoming-call':
                this.showIncomingCall(data);
                break;
                
            case 'call-response':
                this.handleCallResponse(data);
                break;
                
            case 'offer':
                this.handleOffer(data);
                break;
                
            case 'answer':
                this.handleAnswer(data);
                break;
                
            case 'ice-candidate':
                this.handleIceCandidate(data);
                break;
                
            case 'onlineUsers':
                this.updateOnlineUsers(data.users);
                break;
                
            case 'user-unblocked':
                // 상대방이 나를 차단 해제했을 때
                if (this.blockedUsers.has(data.fromUserId)) {
                    this.blockedUsers.delete(data.fromUserId);
                    console.log('차단 해제됨:', data.fromUserId);
                }
                break;
                
            case 'reject-one-way-call':
                // 일방향 통화가 거절되었을 때
                const rejectorUser = this.onlineUsers.get(data.fromUserId);
                const rejectorName = rejectorUser ? rejectorUser.profile.name : '사용자';
                
                if (data.blocked) {
                    this.blockedUsers.add(data.fromUserId);
                    alert(`${rejectorName}님이 통화를 거절했습니다.\n\n상대방이 먼저 연락할 때까지 다시 연락할 수 없습니다.`);
                } else {
                    alert(`${rejectorName}님이 통화를 거절했습니다.`);
                }
                
                // 통화 화면을 닫고 메인 화면으로 돌아가기
                this.endCall();
                break;
                
            case 'accept-speaking':
                // 상대방이 일단 들음 모드에서 말하기를 수락했을 때
                const acceptUser = this.onlineUsers.get(data.fromUserId);
                const acceptUserName = acceptUser ? acceptUser.profile.name : '사용자';
                console.log(`${acceptUserName}님이 말하기를 수락했습니다.`);
                
                // 통화 상태를 양방향으로 변경
                if (this.currentCall) {
                    this.currentCall.mode = 'normal';
                    document.getElementById('callStatus').textContent = '양방향 통화 중';
                }
                break;
                
            case 'reject-speaking':
                // 상대방이 일단 들음 모드에서 말하기를 거절했을 때
                const rejectSpeakingUser = this.onlineUsers.get(data.fromUserId);
                const rejectSpeakingUserName = rejectSpeakingUser ? rejectSpeakingUser.profile.name : '사용자';
                
                if (data.blocked) {
                    this.blockedUsers.add(data.fromUserId);
                    alert(`${rejectSpeakingUserName}님이 말하기를 거절했습니다.\n\n상대방이 먼저 연락할 때까지 다시 연락할 수 없습니다.`);
                } else {
                    alert(`${rejectSpeakingUserName}님이 말하기를 거절했습니다.`);
                }
                
                // 통화 종료
                this.endCall();
                break;
                
            case 'call-ended':
                // 상대방이 통화를 종료했을 때
                const endedUser = this.onlineUsers.get(data.fromUserId);
                const endedUserName = endedUser ? endedUser.profile.name : '사용자';
                
                console.log(`${endedUserName}님이 통화를 종료했습니다.`);
                
                // 상대방이 통화를 종료했으므로 내 화면도 닫기 (알림 없이)
                // 통화 종료 알림을 다시 보내지 않도록 currentCall을 먼저 제거
                this.currentCall = null;
                
                // UI 초기화 (스트림 정리 등)
                if (this.localStream) {
                    this.localStream.getTracks().forEach(track => track.stop());
                    this.localStream = null;
                }
                
                if (this.peerConnection) {
                    this.peerConnection.close();
                    this.peerConnection = null;
                }
                
                if (this.dataChannel) {
                    this.dataChannel.close();
                    this.dataChannel = null;
                }
                
                // UI 초기화
                const localVideo = document.getElementById('localVideo');
                const remoteVideo = document.getElementById('remoteVideo');
                
                localVideo.srcObject = null;
                remoteVideo.srcObject = null;
                localVideo.style.display = '';
                
                // 일방향 통화 메시지 제거
                const oneWayMessage = document.getElementById('oneWayMessage');
                if (oneWayMessage) {
                    oneWayMessage.remove();
                }
                
                // 거절 버튼 숨기기
                document.getElementById('rejectOneWayCall').classList.add('hidden');
                
                document.getElementById('chatMessages').innerHTML = '';
                
                // 메인 화면으로 돌아가기
                this.showMainScreen();
                break;
        }
    }
    
    // 사용자 검색
    searchUsers() {
        const query = document.getElementById('searchInput').value.trim();
        if (query && this.ws) {
            this.ws.send(JSON.stringify({
                type: 'search',
                userId: this.userId,
                query: query
            }));
        }
    }
    
    displaySearchResults(results) {
        const container = document.getElementById('searchResults');
        container.innerHTML = '';
        
        results.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.className = 'user-item';
            userDiv.innerHTML = `
                <div class="user-info-item">
                    <h4>${user.profile.name}</h4>
                    <p>${user.profile.bio || '소개가 없습니다.'}</p>
                </div>
                <div class="user-actions">
                    <button class="call-btn" onclick="messenger.startCall('${user.userId}', 'audio')">음성</button>
                    <button class="video-btn" onclick="messenger.startCall('${user.userId}', 'video')">영상</button>
                    <button class="chat-btn" onclick="messenger.startChat('${user.userId}')">채팅</button>
                </div>
            `;
            container.appendChild(userDiv);
        });
    }
    
    // 온라인 사용자 목록 업데이트
    updateOnlineUsers(users) {
        // 현재 사용자 제외
        const otherUsers = users.filter(user => user.userId !== this.userId);
        
        // 온라인 사용자 목록 저장
        this.onlineUsers.clear();
        otherUsers.forEach(user => {
            this.onlineUsers.set(user.userId, user);
        });
        
        // UI 업데이트
        this.displayOnlineUsers(otherUsers);
        
        // 온라인 사용자 수 업데이트
        document.getElementById('onlineCount').textContent = otherUsers.length;
        
        console.log(`온라인 사용자 목록 업데이트: ${otherUsers.length}명`);
    }
    
    // 온라인 사용자 목록 표시
    displayOnlineUsers(users) {
        const container = document.getElementById('onlineUsersList');
        container.innerHTML = '';
        
        if (users.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">현재 온라인인 사용자가 없습니다.</p>';
            return;
        }
        
        users.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.className = 'online-user-item';
            userDiv.innerHTML = `
                <div class="online-user-info">
                    <span class="online-status"></span>
                    <div>
                        <div class="online-user-name">${user.profile.name}</div>
                        <div class="online-user-bio">${user.profile.bio || '소개가 없습니다.'}</div>
                    </div>
                </div>
                <div class="call-buttons">
                    <button class="audio-call-btn" onclick="messenger.startCall('${user.userId}', 'audio')" title="음성 통화">🎵</button>
                    <button class="video-call-btn" onclick="messenger.startCall('${user.userId}', 'video')" title="영상 통화">📹</button>
                </div>
            `;
            container.appendChild(userDiv);
        });
    }
    
    // 차단된 사용자 목록 표시
    displayBlockedUsers() {
        const container = document.getElementById('blockedUsersList');
        const countElement = document.getElementById('blockedCount');
        
        // 차단된 사용자 수 업데이트
        countElement.textContent = this.rejectedByMe.size;
        
        container.innerHTML = '';
        
        if (this.rejectedByMe.size === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">차단된 사용자가 없습니다.</p>';
            return;
        }
        
        // 차단된 사용자 목록 표시
        this.rejectedByMe.forEach(userId => {
            // 온라인 사용자에서 정보 찾기
            const userInfo = this.onlineUsers.get(userId);
            const userName = userInfo ? userInfo.profile.name : `사용자 ${userId.substring(0, 8)}`;
            const userBio = userInfo ? userInfo.profile.bio : '오프라인';
            
            const userDiv = document.createElement('div');
            userDiv.className = 'blocked-user-item';
            userDiv.innerHTML = `
                <div class="blocked-user-info">
                    <span class="blocked-status"></span>
                    <div>
                        <div class="blocked-user-name">${userName}</div>
                        <div class="online-user-bio">${userBio || '소개가 없습니다.'}</div>
                    </div>
                </div>
                <button class="unblock-btn" onclick="messenger.unblockUser('${userId}')">차단 해제</button>
            `;
            container.appendChild(userDiv);
        });
    }
    
    // 사용자 차단 해제
    unblockUser(userId) {
        if (this.rejectedByMe.has(userId)) {
            this.rejectedByMe.delete(userId);
            console.log('수동 차단 해제:', userId);
            
            // 서버에 차단 해제 알림
            this.ws.send(JSON.stringify({
                type: 'unblock-user',
                userId: this.userId,
                targetUserId: userId
            }));
            
            // UI 업데이트
            this.displayBlockedUsers();
        }
    }
    
    // 통화 시작
    async startCall(targetUserId, callType) {
        // 차단된 사용자 확인
        if (this.blockedUsers.has(targetUserId)) {
            alert('이 사용자는 통화를 거절했습니다. 상대방이 먼저 연락할 때까지 기다려주세요.');
            return;
        }
        
        // 내가 이전에 거절한 사용자에게 먼저 연락하는 경우 차단 해제
        if (this.rejectedByMe.has(targetUserId)) {
            this.rejectedByMe.delete(targetUserId);
            console.log('차단 해제:', targetUserId);
            
            // 서버에 차단 해제 알림
            this.ws.send(JSON.stringify({
                type: 'unblock-user',
                userId: this.userId,
                targetUserId: targetUserId
            }));
            
            // 차단된 사용자 목록 업데이트
            this.displayBlockedUsers();
        }
        
        this.currentCall = { targetUserId, callType, mode: this.callMode };
    
    // 듣기만 해 모드인 경우 미디어 스트림 없이 통화 시작
    if (this.callMode === 'listen-only') {
        // 통화 요청 전송 (듣기만 해 모드)
        this.ws.send(JSON.stringify({
            type: 'call-request',
            userId: this.userId,
            targetUserId: targetUserId,
            fromProfile: this.userProfile,
            callType: callType,
            callMode: 'listen-only'
        }));
        
        this.showCallScreen();
        document.getElementById('callStatus').textContent = '듣기만 해 모드로 연결 중...';
        
        // 로컬 비디오 숨기기
        const localVideo = document.getElementById('localVideo');
        localVideo.style.display = 'none';
        
        return;
    }
    
    // 일반 모드 또는 일단 들음 모드: 미디어 스트림 획득
    try {
        const constraints = {
            audio: true,
            video: callType === 'video'
        };
        
        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = this.localStream;
        
        // 로컬 비디오 미러링 적용 (JavaScript로 강제 적용)
        if (callType === 'video') {
            localVideo.style.transform = 'scaleX(-1)';
            localVideo.style.webkitTransform = 'scaleX(-1)';
            localVideo.style.mozTransform = 'scaleX(-1)';
            localVideo.style.msTransform = 'scaleX(-1)';
        }
        
        // 통화 요청 전송
        this.ws.send(JSON.stringify({
            type: 'call-request',
            userId: this.userId,
            targetUserId: targetUserId,
            fromProfile: this.userProfile,
            callType: callType,
            callMode: this.callMode
        }));
        
        this.showCallScreen();
        const statusText = this.callMode === 'listen-first' ? '일단 들음 모드로 연결 중...' : '연결 중...';
        document.getElementById('callStatus').textContent = statusText;
        
    } catch (error) {
        console.error('미디어 접근 오류:', error);
        alert('카메라/마이크 접근 권한이 필요합니다.');
    }
}
    
    // 수신 통화 처리
    showIncomingCall(data) {
        this.incomingCallData = data;
        
        switch (this.callMode) {
            case 'normal':
                // 받으면 말해: 일반 통화 수락/거절 선택
                document.getElementById('callerName').textContent = data.fromProfile.name;
                document.getElementById('callType').textContent = data.callType === 'video' ? '영상' : '음성';
                document.getElementById('incomingCall').classList.remove('hidden');
                break;
                
            case 'listen-first':
                // 일단 들음: 먼저 듣고 나서 말할지 결정
                console.log('일단 들음 모드로 통화 수신:', data.fromProfile.name);
                this.acceptIncomingCallListenFirst();
                break;
                
            case 'listen-only':
                // 듣기만 해: 자동 수락하지만 내 음성은 전달되지 않음
                console.log('듣기만 하기 모드로 통화 수신:', data.fromProfile.name);
                this.acceptIncomingCallListenOnly();
                break;
        }
    }
    
    async acceptIncomingCall() {
        document.getElementById('incomingCall').classList.add('hidden');
        
        const callType = this.incomingCallData.callType;
        this.currentCall = { 
            targetUserId: this.incomingCallData.fromUserId, 
            callType: callType 
        };
        
        try {
            const constraints = {
                audio: true,
                video: callType === 'video'
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;
            
            // 로컬 비디오 미러링 적용 (JavaScript로 강제 적용)
            localVideo.style.transform = 'scaleX(-1)';
            localVideo.style.webkitTransform = 'scaleX(-1)';
            localVideo.style.mozTransform = 'scaleX(-1)';
            localVideo.style.msTransform = 'scaleX(-1)';
            
            // 통화 수락 응답
            this.ws.send(JSON.stringify({
                type: 'call-response',
                userId: this.userId,
                targetUserId: this.incomingCallData.fromUserId,
                accepted: true
            }));
            
            this.showCallScreen();
            document.getElementById('callStatus').textContent = '연결 중...';
            
        } catch (error) {
            console.error('미디어 접근 오류:', error);
            alert('카메라/마이크 접근 권한이 필요합니다.');
        }
    }
    
    // 일단 들음 모드: 먼저 듣고 나서 말할지 결정
    async acceptIncomingCallListenFirst() {
        const callType = this.incomingCallData.callType;
        this.currentCall = { 
            targetUserId: this.incomingCallData.fromUserId, 
            callType: callType,
            mode: 'listen-first'
        };
        
        // 일단 들음 모드로 수락
        this.ws.send(JSON.stringify({
            type: 'call-response',
            userId: this.userId,
            targetUserId: this.incomingCallData.fromUserId,
            accepted: true,
            callMode: 'listen-first'
        }));
        
        this.showCallScreen();
        document.getElementById('callStatus').textContent = '일단 들음 모드 - 듣고 있습니다...';
        
        // 로컬 비디오를 비활성화
        const localVideo = document.getElementById('localVideo');
        localVideo.style.display = 'none';
        
        // 안내 메시지와 수락/거절 버튼 표시
        this.showListenFirstControls();
    }
    
    // 듣기만 해 모드: 내 음성은 전달되지 않음
    async acceptIncomingCallListenOnly() {
        const callType = this.incomingCallData.callType;
        this.currentCall = { 
            targetUserId: this.incomingCallData.fromUserId, 
            callType: callType,
            mode: 'listen-only'
        };
        
        // 듣기만 해 모드로 수락
        this.ws.send(JSON.stringify({
            type: 'call-response',
            userId: this.userId,
            targetUserId: this.incomingCallData.fromUserId,
            accepted: true,
            callMode: 'listen-only'
        }));
        
        this.showCallScreen();
        document.getElementById('callStatus').textContent = '듣기만 해 모드 - 내 음성은 전달되지 않습니다';
        
        // 로컬 비디오를 비활성화하고 메시지 표시
        const localVideo = document.getElementById('localVideo');
        localVideo.style.display = 'none';
        
        // 거절 버튼 표시
        document.getElementById('rejectOneWayCall').classList.remove('hidden');
        
        // 안내 메시지 추가
        const videoContainer = document.querySelector('.video-container');
        if (!document.getElementById('oneWayMessage')) {
            const messageDiv = document.createElement('div');
            messageDiv.id = 'oneWayMessage';
            messageDiv.style.cssText = 'position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: white; padding: 10px; border-radius: 5px; font-size: 14px;';
            messageDiv.textContent = '듣기만 해 모드: 상대방의 영상/음성만 수신합니다.';
            videoContainer.style.position = 'relative';
            videoContainer.appendChild(messageDiv);
        }
    }
    
    // 일방향 통화 수락 (기존 메서드 - 호환성 유지)
    async acceptIncomingCallOneWay() {
        return this.acceptIncomingCallListenOnly();
    }
    
    // 일단 들음 모드 컨트롤 표시
    showListenFirstControls() {
        const videoContainer = document.querySelector('.video-container');
        
        // 기존 메시지 제거
        const existingMessage = document.getElementById('listenFirstMessage');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // 안내 메시지와 버튼 추가
        const controlsDiv = document.createElement('div');
        controlsDiv.id = 'listenFirstMessage';
        controlsDiv.style.cssText = 'position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: white; padding: 15px; border-radius: 8px; font-size: 14px; z-index: 1000;';
        controlsDiv.innerHTML = `
            <div style="margin-bottom: 10px;">일단 들음 모드: 상대방의 음성을 듣고 있습니다.</div>
            <div style="display: flex; gap: 10px;">
                <button id="acceptSpeaking" style="background: #4CAF50; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">말하기 수락</button>
                <button id="rejectSpeaking" style="background: #f44336; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">거절</button>
            </div>
        `;
        
        videoContainer.style.position = 'relative';
        videoContainer.appendChild(controlsDiv);
        
        // 버튼 이벤트 리스너 추가
        document.getElementById('acceptSpeaking').addEventListener('click', () => {
            this.acceptSpeakingInCall();
        });
        
        document.getElementById('rejectSpeaking').addEventListener('click', () => {
            this.rejectSpeakingInCall();
        });
    }
    
    // 일단 들음 모드에서 말하기 수락
    async acceptSpeakingInCall() {
        try {
            // 로컬 스트림 획득
            const constraints = {
                audio: true,
                video: this.currentCall.callType === 'video'
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;
            localVideo.style.display = this.currentCall.callType === 'video' ? 'block' : 'none';
            
            // 로컬 비디오 미러링 적용
            if (this.currentCall.callType === 'video') {
                localVideo.style.transform = 'scaleX(-1)';
                localVideo.style.webkitTransform = 'scaleX(-1)';
                localVideo.style.mozTransform = 'scaleX(-1)';
                localVideo.style.msTransform = 'scaleX(-1)';
            }
            
            // 서버에 말하기 수락 알림
            this.ws.send(JSON.stringify({
                type: 'accept-speaking',
                userId: this.userId,
                targetUserId: this.currentCall.targetUserId
            }));
            
            // UI 업데이트
            document.getElementById('callStatus').textContent = '양방향 통화 중';
            this.currentCall.mode = 'normal';
            
            // 컨트롤 메시지 제거
            const controlsMessage = document.getElementById('listenFirstMessage');
            if (controlsMessage) {
                controlsMessage.remove();
            }
            
        } catch (error) {
            console.error('미디어 접근 오류:', error);
            alert('카메라/마이크 접근 권한이 필요합니다.');
        }
    }
    
    // 일단 들음 모드에서 말하기 거절
    rejectSpeakingInCall() {
        // 거절한 사용자를 차단 목록에 추가
        this.rejectedByMe.add(this.currentCall.targetUserId);
        console.log('일단 들음 모드에서 거절 및 차단:', this.currentCall.targetUserId);
        
        // 서버에 거절 알림 전송
        this.ws.send(JSON.stringify({
            type: 'reject-speaking',
            userId: this.userId,
            targetUserId: this.currentCall.targetUserId,
            blocked: true
        }));
        
        // 차단된 사용자 목록 업데이트
        this.displayBlockedUsers();
        
        // 통화 종료
        this.endCall();
    }
    
    // 일방향/듣기만 해 모드 통화 거절
    rejectOneWayCall() {
        if (!this.currentCall || (!this.currentCall.isOneWay && this.currentCall.mode !== 'listen-only')) {
            return;
        }
        
        // 거절한 사용자를 차단 목록에 추가
        this.rejectedByMe.add(this.currentCall.targetUserId);
        console.log('듣기만 해 모드 거절 및 차단:', this.currentCall.targetUserId);
        
        // 서버에 거절 알림 전송
        this.ws.send(JSON.stringify({
            type: 'reject-one-way-call',
            userId: this.userId,
            targetUserId: this.currentCall.targetUserId,
            blocked: true
        }));
        
        // 차단된 사용자 목록 업데이트
        this.displayBlockedUsers();
        
        // 통화 종료
        this.endCall();
    }
    
    rejectIncomingCall() {
        document.getElementById('incomingCall').classList.add('hidden');
        
        // 거절한 사용자를 차단 목록에 추가 (내가 먼저 연락할 때까지)
        this.rejectedByMe.add(this.incomingCallData.fromUserId);
        console.log('사용자 거절 및 차단:', this.incomingCallData.fromProfile.name);
        
        this.ws.send(JSON.stringify({
            type: 'call-response',
            userId: this.userId,
            targetUserId: this.incomingCallData.fromUserId,
            accepted: false,
            blocked: true // 차단 정보 전달
        }));
        
        // 차단된 사용자 목록 업데이트
        this.displayBlockedUsers();
    }
    
    // WebRTC 연결 설정
    async setupPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        };
        
        this.peerConnection = new RTCPeerConnection(configuration);
        
        // 로컬 스트림 추가
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }
        
        // 원격 스트림 처리
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            document.getElementById('remoteVideo').srcObject = this.remoteStream;
            document.getElementById('callStatus').textContent = '연결됨';
        };
        
        // ICE 후보 처리
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.ws.send(JSON.stringify({
                    type: 'ice-candidate',
                    userId: this.userId,
                    targetUserId: this.currentCall.targetUserId,
                    candidate: event.candidate
                }));
            }
        };
        
        // 데이터 채널 설정 (채팅용)
        this.dataChannel = this.peerConnection.createDataChannel('chat');
        this.dataChannel.onmessage = (event) => {
            this.displayChatMessage(event.data, false);
        };
        
        this.peerConnection.ondatachannel = (event) => {
            const channel = event.channel;
            channel.onmessage = (event) => {
                this.displayChatMessage(event.data, false);
            };
        };
    }
    
    // WebRTC 시그널링 처리
    async handleCallResponse(data) {
        if (data.accepted) {
            await this.setupPeerConnection();
            
            // Offer 생성 및 전송
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            this.ws.send(JSON.stringify({
                type: 'offer',
                userId: this.userId,
                targetUserId: this.currentCall.targetUserId,
                offer: offer
            }));
        } else {
            // 거절된 경우 차단 정보 처리
            const targetUser = this.onlineUsers.get(this.currentCall.targetUserId);
            const targetName = targetUser ? targetUser.profile.name : '사용자';
            
            if (data.blocked) {
                this.blockedUsers.add(this.currentCall.targetUserId);
                alert(`${targetName}님이 통화를 거절했습니다.\n\n상대방이 먼저 연락할 때까지 다시 연락할 수 없습니다.`);
            } else {
                alert(`${targetName}님이 통화를 거절했습니다.`);
            }
            
            // 통화 화면을 닫고 메인 화면으로 돌아가기
            this.endCall();
        }
    }
    
    async handleOffer(data) {
        await this.setupPeerConnection();
        
        await this.peerConnection.setRemoteDescription(data.offer);
        
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        
        this.ws.send(JSON.stringify({
            type: 'answer',
            userId: this.userId,
            targetUserId: data.fromUserId,
            answer: answer
        }));
    }
    
    async handleAnswer(data) {
        await this.peerConnection.setRemoteDescription(data.answer);
    }
    
    async handleIceCandidate(data) {
        if (this.peerConnection) {
            await this.peerConnection.addIceCandidate(data.candidate);
        }
    }
    
    // 통화 제어
    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                document.getElementById('toggleVideo').style.opacity = videoTrack.enabled ? '1' : '0.5';
            }
        }
    }
    
    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                document.getElementById('toggleAudio').style.opacity = audioTrack.enabled ? '1' : '0.5';
            }
        }
    }
    
    endCall() {
        // 통화 종료 알림을 상대방에게 전송
        if (this.currentCall && this.currentCall.targetUserId && this.ws) {
            this.ws.send(JSON.stringify({
                type: 'call-ended',
                userId: this.userId,
                targetUserId: this.currentCall.targetUserId
            }));
            console.log('통화 종료 알림 전송:', this.currentCall.targetUserId);
        }
        
        // 스트림 정리
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // 피어 연결 정리
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // 데이터 채널 정리
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        
        // UI 초기화
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        
        localVideo.srcObject = null;
        remoteVideo.srcObject = null;
        localVideo.style.display = ''; // 일방향 모드에서 숨긴 로컬 비디오 복원
        
        // 모든 통화 모드 관련 메시지 제거
        const oneWayMessage = document.getElementById('oneWayMessage');
        if (oneWayMessage) {
            oneWayMessage.remove();
        }
        
        const listenFirstMessage = document.getElementById('listenFirstMessage');
        if (listenFirstMessage) {
            listenFirstMessage.remove();
        }
        
        // 거절 버튼 숨기기
        document.getElementById('rejectOneWayCall').classList.add('hidden');
        
        document.getElementById('chatMessages').innerHTML = '';
        
        this.currentCall = null;
        this.showMainScreen();
    }
    
    // 채팅 기능
    startChat(targetUserId) {
        // 채팅 전용 연결 (음성/영상 없이)
        this.startCall(targetUserId, 'chat');
    }
    
    sendChatMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        
        if (message && this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(message);
            this.displayChatMessage(message, true);
            input.value = '';
        }
    }
    
    displayChatMessage(message, isSent) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        messageDiv.textContent = message;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// 전역 인스턴스 생성
const messenger = new P2PMessenger();

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
    
    // 통화 시작
    async startCall(targetUserId, callType) {
        this.currentCall = { targetUserId, callType };
        
        // 미디어 스트림 획득
        try {
            const constraints = {
                audio: true,
                video: callType === 'video'
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            document.getElementById('localVideo').srcObject = this.localStream;
            
            // 통화 요청 전송
            this.ws.send(JSON.stringify({
                type: 'call-request',
                userId: this.userId,
                targetUserId: targetUserId,
                fromProfile: this.userProfile,
                callType: callType
            }));
            
            this.showCallScreen();
            document.getElementById('callStatus').textContent = '연결 중...';
            
        } catch (error) {
            console.error('미디어 접근 오류:', error);
            alert('카메라/마이크 접근 권한이 필요합니다.');
        }
    }
    
    // 수신 통화 처리
    showIncomingCall(data) {
        document.getElementById('callerName').textContent = data.fromProfile.name;
        document.getElementById('callType').textContent = data.callType === 'video' ? '영상' : '음성';
        document.getElementById('incomingCall').classList.remove('hidden');
        
        this.incomingCallData = data;
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
            document.getElementById('localVideo').srcObject = this.localStream;
            
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
    
    rejectIncomingCall() {
        document.getElementById('incomingCall').classList.add('hidden');
        
        this.ws.send(JSON.stringify({
            type: 'call-response',
            userId: this.userId,
            targetUserId: this.incomingCallData.fromUserId,
            accepted: false
        }));
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
            alert('통화가 거절되었습니다.');
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
        document.getElementById('localVideo').srcObject = null;
        document.getElementById('remoteVideo').srcObject = null;
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

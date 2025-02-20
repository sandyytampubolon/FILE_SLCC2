document.addEventListener('DOMContentLoaded', function() {
    console.log('Hello from main.js');

    var inputUsername = document.querySelector('#username');
    var btnJoin = document.querySelector('#btn-join');
    var localVideo = document.querySelector('#local-video');
    var btnToggleAudio = document.querySelector('#btn-toggle-audio');
    var btnToggleVideo = document.querySelector('#btn-toggle-video');

    var mapPeers = {};
    var username;
    var webSocket;

    function webSocketOnMessage(event) {
        var parsedData = JSON.parse(event.data);
        var peerUsername = parsedData['peer'];
        var action = parsedData['action'];

        if (username == peerUsername) {
            return;
        }

        var receiver_channel_name = parsedData['message']['receiver_channel_name'];

        if (action == 'new-peer') {
            createOfferer(peerUsername, receiver_channel_name);
            return;
        }

        if (action == 'new-offer') {
            var offer = parsedData['message']['sdp'];
            createAnswerer(offer, peerUsername, receiver_channel_name);
            return;
        }

        if (action == 'new-answer') {
            var answer = parsedData['message']['sdp'];
            var peer = mapPeers[peerUsername][0];
            peer.setRemoteDescription(answer);
            return;
        }
    }



    btnJoin.addEventListener('click', function() {
        username = inputUsername.value;
        console.log('Username:', username);

        if (username == '') {
            return;
        }

        inputUsername.value = '';
        inputUsername.disabled = true;
        inputUsername.style.visibility = 'hidden';

        btnJoin.disabled = true;
        btnJoin.style.visibility = 'hidden';

        var labelUsername = document.querySelector('#username-label');
        labelUsername.innerHTML = username;

        var loc = window.location;
        var wsStart = 'ws://';

        if (loc.protocol == 'https:') {
            wsStart = 'wss://';
        }

        var endpoint = wsStart + loc.host + loc.pathname;
        console.log('Connecting to:', endpoint);

        webSocket = new WebSocket(endpoint);

        webSocket.addEventListener('open', function(e) {
            console.log('Connection opened:', e);
            sendSignal('new-peer', {});
        });
        webSocket.addEventListener('message', webSocketOnMessage);
        webSocket.addEventListener('close', function(e) {
            console.log('Connection Closed!:', e);
        });
        webSocket.addEventListener('error', function(e) {
            console.log('Connection Error!:', e);
        });
    });

    var localStream = new MediaStream();
    const constraints = {
        video: true,
        audio: true
    };

    var userMedia = navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            localStream = stream;
            localVideo.srcObject = localStream;
            localVideo.muted = true;

            var audioTracks = stream.getAudioTracks();
            var videoTracks = stream.getVideoTracks();

            audioTracks[0].enabled = true;
            videoTracks[0].enabled = true;

            btnToggleAudio.addEventListener('click', function() {
                audioTracks[0].enabled = !audioTracks[0].enabled;

                if (audioTracks[0].enabled) {
                    btnToggleAudio.innerHTML = 'Audio Mute';
                    return;
                }
                btnToggleAudio.innerHTML = 'Audio Unmute';
            });

            btnToggleVideo.addEventListener('click', function() {
                videoTracks[0].enabled = !videoTracks[0].enabled;

                if (videoTracks[0].enabled) {
                    btnToggleVideo.innerHTML = 'Video Off';
                    return;
                }
                btnToggleVideo.innerHTML = 'Video On';
            });
        })
        .catch(error => {
            console.error('Error accessing media devices.', error);
        });

    function sendSignal(action, message) {
        var jsonStr = JSON.stringify({
            'peer': username,
            'action': action,
            'message': message,
        });

        console.log("Mengirim data ke WebSocket:", jsonStr);
        webSocket.send(jsonStr);
    }

    // Offer
    function createOfferer(peerUsername, receiver_channel_name) {
        var peer = new RTCPeerConnection(null);
        addLocalTracks(peer);

        var dc = peer.createDataChannel('channel');
        dc.addEventListener('open', function() {
            console.log('Connection opened!');
        });
        dc.addEventListener('message', dcOnMessage);

        var remoteVideo = createVideo(peerUsername);
        setOnTrack(peer, remoteVideo);

        mapPeers[peerUsername] = [peer, dc];

        peer.addEventListener('iceconnectionstatechange', () => {
            var iceConnectionState = peer.iceConnectionState;

            if (iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed') {
                delete mapPeers[peerUsername];
                if (iceConnectionState !== 'closed') {
                    peer.close();
                }
                removeVideo(remoteVideo, peerUsername);
            }
        });

        peer.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                console.log('New Ice Candidate:', JSON.stringify(peer.localDescription));
                return;
            }

            sendSignal('new-offer', {
                'sdp': peer.localDescription,
                'receiver_channel_name': receiver_channel_name
            });
        });

        peer.createOffer()
            .then(o => peer.setLocalDescription(o))
            .then(() => {
                console.log('Local Description set successfully!');
            });
    }

    // Answer
    function createAnswerer(offer, peerUsername, receiver_channel_name) {
        var peer = new RTCPeerConnection(null);
        addLocalTracks(peer);

        var remoteVideo = createVideo(peerUsername);
        setOnTrack(peer, remoteVideo);

        peer.addEventListener('datachannel', (e) => {
            peer.dc = e.channel;
            peer.dc.addEventListener('open', () => {
                console.log('Connection opened!');
            });
            peer.dc.addEventListener('message', dcOnMessage);

            mapPeers[peerUsername] = [peer, peer.dc];
        });

        peer.addEventListener('iceconnectionstatechange', () => {
            var iceConnectionState = peer.iceConnectionState;

            if (iceConnectionState === 'failed' || iceConnectionState === 'disconnected' || iceConnectionState === 'closed') {
                delete mapPeers[peerUsername];
                if (iceConnectionState !== 'closed') {
                    peer.close();
                }
                removeVideo(remoteVideo, peerUsername);
            }
        });

        peer.addEventListener('icecandidate', (event) => {
            if (event.candidate) {
                console.log('New Ice Candidate:', JSON.stringify(peer.localDescription));
                return;
            }

            sendSignal('new-answer', {
                'sdp': peer.localDescription,
                'receiver_channel_name': receiver_channel_name
            });
        });

        peer.setRemoteDescription(offer)
            .then(() => {
                console.log('Remote Description set successfully for %s.', peerUsername);
                return peer.createAnswer();
            })
            .then(a => {
                console.log('Answer created!');
                peer.setLocalDescription(a);
            });
    }

    function addLocalTracks(peer) {
        localStream.getTracks().forEach(track => {
            peer.addTrack(track, localStream);
        });
        return;
    }

    var messageList = document.querySelector('#message-list');
    function dcOnMessage(event) {
        var message = event.data;

        var li = document.createElement('li');
        li.appendChild(document.createTextNode(message));
        messageList.appendChild(li);
    }

    function updateVideoLayout() {
        const videoContainer = document.getElementById('video-container');
        const remoteVideos = document.getElementById('remote-videos');
        const numVideos = remoteVideos.children.length + 1; // Including local video

        if (numVideos === 1) {
            videoContainer.style.gridTemplateColumns = '1fr';
            videoContainer.style.gridTemplateRows = '1fr';
            document.getElementById('local-video-wrapper').classList.add('fullscreen');
        } else {
            document.getElementById('local-video-wrapper').classList.remove('fullscreen');
            if (numVideos === 2) {
                videoContainer.style.gridTemplateColumns = '1fr 1fr';
                videoContainer.style.gridTemplateRows = '1fr';
            } else if (numVideos <= 4) {
                videoContainer.style.gridTemplateColumns = '1fr 1fr';
                videoContainer.style.gridTemplateRows = '1fr 1fr';
            } else {
                videoContainer.style.gridTemplateColumns = '1fr 1fr 1fr';
                videoContainer.style.gridTemplateRows = '1fr 1fr';
            }
        }
    }

function createVideo(peerUsername) {
    let videoContainer = document.getElementById('remote-videos');

    let videoWrapper = document.createElement('div');
    videoWrapper.id = `video-wrapper-${peerUsername}`;
    videoWrapper.classList.add('video-wrapper');
    
    // Cek apakah nama peserta sudah ada dalam video wrapper
    let usernameLabel = videoWrapper.querySelector('.participant-username');
    if (!usernameLabel) {
        // Jika belum ada, buat elemen nama
        usernameLabel = document.createElement('div');
        usernameLabel.classList.add('participant-username');
        usernameLabel.textContent = peerUsername;
    }

    // Membuat elemen video
    let videoElement = document.createElement('video');
    videoElement.id = `video-${peerUsername}`;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.classList.add('remote-video');

    // Menambahkan username dan video ke dalam video wrapper
    videoWrapper.appendChild(usernameLabel);
    videoWrapper.appendChild(videoElement);
    
    // Menambahkan video wrapper ke dalam container
    videoContainer.appendChild(videoWrapper);

    // Update layout dan tampilkan
    addParticipantName(peerUsername);
    updateVideoLayout(); // Update layout setiap kali video baru ditambahkan

    return videoElement;
}



    function setOnTrack(peer, remoteVideo) {
        let remoteStream = new MediaStream();

        peer.addEventListener('track', async (event) => {
            remoteStream.addTrack(event.track);
            remoteVideo.srcObject = remoteStream;
        });
    }

    function removeVideo(video, peerUsername) {
        var videoWrapper = video.parentNode;
        videoWrapper.parentNode.removeChild(videoWrapper);

        // Remove participant name from the participants list
        removeParticipantName(peerUsername);

        updateVideoLayout(); // Update layout whenever a video is removed
    }

function addParticipantName(peerUsername) {
    const participantsList = document.getElementById('participants-list');
    
    // Cek apakah elemen sudah ada berdasarkan ID peserta
    if (!document.getElementById(`participant-${peerUsername}`)) {
        const participantItem = document.createElement('div');
        participantItem.id = `participant-${peerUsername}`;
        participantItem.classList.add('text-white');
        participantItem.textContent = peerUsername;
        participantsList.appendChild(participantItem);
    }
}


    function removeParticipantName(peerUsername) {
        const participantItem = document.getElementById(`participant-${peerUsername}`);
        if (participantItem) {
            participantItem.parentNode.removeChild(participantItem);
        }
    }
});

    // Sign Language Prediction
let model;
const classLabels = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 
    'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    'SPACE', 'DELETE', 'NOTHING'
];
isPredicting = false;
btnPredict = document.getElementById('btn-predict');
outputText= document.getElementById('output-text');
guideBox= document.getElementById('guide-box');
 
// Load the model
async function loadModel() {
    try {
        model = await tf.loadLayersModel("/./static/model/model.json"); // Path to your TensorFlow.js model
        console.log("Model loaded successfully!");
    } catch (error) {
        console.error("Error loading model:", error);
    }
}
 
// Preprocess video frame for prediction
function preprocessFrame(videoElement) {
    const canvas = document.createElement('canvas');
    canvas.width = 224; // Match model input size
    canvas.height = 224;
    const ctx = canvas.getContext('2d');
    const boxRect = guideBox.getBoundingClientRect();
    const videoRect = localVideo.getBoundingClientRect();
    // Hitung rasio perbedaan antara ukuran tampilan video dan ukuran asli
    const scaleX = videoElement.videoWidth / videoRect.width;
    const scaleY = videoElement.videoHeight / videoRect.height;
    // Hitung koordinat dalam skala video asli
    const x = (boxRect.left - videoRect.left) * scaleX;
    const y = (boxRect.top - videoRect.top) * scaleY;
    const width = boxRect.width * scaleX;
    const height = boxRect.height * scaleY;
    ctx.drawImage(videoElement, x, y, width, height, 0, 0, canvas.width, canvas.height);
    let imageData = tf.browser.fromPixels(canvas);
    imageData = imageData.expandDims(0); // Add batch dimension
    imageData = imageData.toFloat().div(127.5).sub(1); // Normalize to [-1, 1] (for MobileNetV2)
    return imageData;
}
 
// Make predictions
async function predictSignLanguage() {
    try {
        if (model && localVideo.readyState >= 2) {
            tf.engine().startScope();
 
            const inputTensor = preprocessFrame(localVideo);
            const prediction = await model.predict(inputTensor);
            const classIndex = prediction.argMax(1).dataSync()[0];
            const predictedLabel = classLabels[classIndex];
            outputText.innerText = `Prediction: ${predictedLabel}`;
            tf.dispose(inputTensor); // Dispose tensors to free memory
            tf.dispose(prediction);
        }
    } catch (error) {
        console.error("Error during prediction:", error);
    }
}
 
// Function to toggle prediction on/off
async function togglePrediction() {
    // Function to toggle prediction on/off
    let predictionTimeout; // Variabel untuk menyimpan timeout prediksi
    if (!isPredicting) {
        // Mulai prediksi
        await loadModel();
        isPredicting = true;
        btnPredict.innerText = "Translate On";
        console.log("Prediction started...");
        guideBox.style.visibility = 'visible';
        const predictLoop = async () => {
            if (!isPredicting) return; // Stop if prediction is turned
            await predictSignLanguage(); // Wait until prediction is finished
            predictionTimeout= setTimeout(predictLoop, 200); // Call predict again after 200ms
        };
        predictLoop();
    } else {
        // Hentikan prediksi
        isPredicting = false;
        btnPredict.innerText = "Translate Off";
        outputText.innerText = "Prediction: -";
        guideBox.style.visibility = 'hidden';
        console.log("Prediction stopped.");
        clearTimeout(predictionTimeout);
        // Hapus model dari memori dengan aman
        if (model) {
            model.dispose();
            model = null;
        }
 
        // Hapus semua tensor aktif
        tf.engine().endScope();
    }
}
 
btnPredict.addEventListener('click', togglePrediction);


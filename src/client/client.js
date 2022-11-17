var loginBtn = document.getElementById('loginBtn'); 
var sendMessageBtn = document.getElementById('sendMessageBtn');
var joinChatroomBtn = document.getElementById('joinChatroomBtn');
var chatWindow = document.getElementById('chatWindow');

var loginInput;
var chatnameInput = document.getElementById('chatnameInput');
var messageInput = document.getElementById('messageInput');

var connectedUser, localConnection, sendChannel;
var localUsername;

// connection to peerName
var connectionNames = new Map();

const configuration = { 
   "iceServers": [
        { "urls": "stun:stun.12connect.com:3478" },
        { "urls": "stun:openrelay.metered.ca:80" },
        {
            "urls": "turn:openrelay.metered.ca:80",
            "username": "openrelayproject",
            "credential": "openrelayproject",
        },
        {
            "urls": "turn:openrelay.metered.ca:443",
            "username": "openrelayproject",
            "credential": "openrelayproject",
        },
        {
            "urls": "turn:openrelay.metered.ca:443?transport=tcp",
            "username": "openrelayproject",
            "credential": "openrelayproject",
        }
    ] 
}; 

var chatroomID;
// map from peerName:string to {connection: RTCPeerConnection, sendChannel: RTCDataChannel}
var members = new Map();

/////////////////////////
// WebSocket to Server //
/////////////////////////

var connection = new WebSocket('wss://ec2-13-40-196-240.eu-west-2.compute.amazonaws.com:3000/'); 
// var connection = new WebSocket('wss://localhost:3000');

connection.onopen = function () { 
    console.log("Connected to server"); 
};
  
connection.onerror = function (err) { 
    console.log("Error: ", err);
    alert("Please authorise https://ec2-13-40-196-240.eu-west-2.compute.amazonaws.com:3000/ on your device before refreshing! ")
};

function sendToServer(message) {
    console.log(JSON.stringify(message));
    connection.send(JSON.stringify(message)); 
};
  
// Handle messages from the server 
connection.onmessage = function (message) { 
    console.log("Got message", message.data);
    var data = JSON.parse(message.data); 
	
    switch(data.type) { 
        case "login": 
            onLogin(data.success); 
            break; 
        case "offer": 
            onOffer(data.offer, data.from); 
            break; 
        case "answer": 
            onAnswer(data.answer, data.from); 
            break; 
        case "candidate": 
            onCandidate(data.candidate, data.from); 
            break;
        case "usernames":
            onUsernames(data.usernames);
            break;
        case "join":
            onJoin(data.usernames);
            break;
        case "leave":
            onLeave(data.from);
        default: 
            break; 
   } 
};
  
// Server approves Login
function onLogin(success) { 

    if (success === false) { 
        alert("oops...try a different username"); 
    } else {
        localUsername = loginInput;
    } 
};

// Sending Offer to Peer
function sendOffer(peerName) {
    
    if (peerName !== null) { 
        const newConnection = initPeerConnection(peerName);
        members.set(peerName, {connection: newConnection, sendChannel: null});
        connectionNames.set(newConnection, peerName);
        peerConnection = members.get(peerName);

        peerConnection.sendChannel = peerConnection.connection.createDataChannel(`${localUsername}->${peerName}`);
        initChannel(peerConnection.sendChannel);
        console.log(`Created sendChannel for ${localUsername}->${peerName}`);

        console.log(`Sending offer to ${peerName}`);
        peerConnection.connection.createOffer(function (offer) { 
            sendToServer({
                to: peerName,
                type: "offer",
                offer: offer 
            });
                
            peerConnection.connection.setLocalDescription(offer);
        }, function (error) { 
            alert("An error has occurred."); 
        }); 
    }
}; 

// Receiving Offer + Sending Answer to Peer
function onOffer(offer, peerName) { 
    members.set(peerName, {connection: initPeerConnection(), sendChannel: null});
    const peerConnection = members.get(peerName);

    peerConnection.connection.setRemoteDescription(offer);

    console.log(`Sending answer to ${peerName}`);
    peerConnection.connection.createAnswer(function (answer) {
        peerConnection.connection.setLocalDescription(answer);
        sendToServer({ 
            to: peerName,
            type: "answer", 
            answer: answer 
        }); 
    }, function (error) { 
        alert("oops...error"); 
    });
}
  
// Receiving Answer from Peer
function onAnswer(answer, peerName) {
    members.get(peerName).connection.setRemoteDescription(answer);
} 
 
// Receiving ICE Candidate from Server
function onCandidate(candidate, peerName) {
    if (members.has(peerName)) {
        members.get(peerName).connection.addIceCandidate(new RTCIceCandidate(candidate)); 
    }
}

function onUsernames(usernames) {
    if (usernames.length > 0) {
        document.getElementById('usernames').innerHTML = `Currently Online: ${usernames.join(", ")}`;
    }
}

function onJoin(usernames) {
    for (peerName of usernames) {
        if (!members.has(peerName) && peerName !== localUsername) {
            sendOffer(peerName);
        }
    }
}

function onLeave(peerName) {
    connectionNames.delete(members.get(peerName).connection);
    members.get(peerName).sendChannel.close();
    members.get(peerName).connection.close();
    updateChatWindow({from: "SET", message: `${peerName} has left the room`});
    members.delete(peerName);
}

////////////////////////////
// Peer to Peer Functions //
////////////////////////////


function initPeerConnection () {
    try {
        const connection = new RTCPeerConnection(configuration);
        connection.ondatachannel = receiveChannelCallback;
        connection.onicecandidate = function (event) {
            console.log("New candidate");
            if (event.candidate) {
                sendToServer({ 
                    type: "candidate", 
                    candidate: event.candidate,
                    name: localUsername,
                    chatroomID: chatroomID
                });
            }
        };
        connection.oniceconnectionstatechange = function (event) {
            if (connection.iceConnectionState === "failed") {
                console.log("Restarting ICE");
                connection.restartIce();
            }
        }
        connection.onconnectionstatechange = function (event) {
            console.log(event);
            if (connection.connectionState === "failed") {
                console.log("Restarting ICE");
                connection.restartIce();
            }
        }
        connection.onnegotiationneeded = function (event) {
            console.log("On negotiation needed")
            if (connection.connectionState === "failed") {
                connection.createOffer(function (offer) { 
                    sendToServer({
                        to: connectionNames.get(connection),
                        type: "offer",
                        offer: offer 
                    });
                    connection.setLocalDescription(offer);
                }, function (error) { 
                    alert("An error has occurred."); 
                }, function () {
                    console.log("Create Offer failed");
                }, {
                    iceRestart: true
                });
            }
        }
        console.log("Local RTCPeerConnection object was created");
        return connection;
    } catch (e) {
        console.error(e);
        return null;
    }
}

function initChannel (channel) {
    channel.onopen = (event) => { 
        console.log(event);
        console.log(`Channel ${event.target.label} opened`);
    }
    channel.onclose = (event) => { console.log(`Channel ${event.target.label} closed`); }
    channel.onmessage = (event) => {
        updateChatWindow(JSON.parse(event.data));
    }
}

function receiveChannelCallback (event) {
    peerName = (event.channel.label).split("->", 1)[0];
    console.log(`Received channel ${event.channel.label} from ${peerName}`);
    const peerConnection = members.get(peerName);
    peerConnection.sendChannel = event.channel;
    initChannel (peerConnection.sendChannel);
    updateChatWindow({from: "SET", message: `${peerName} has joined`});
}

function updateChatWindow (data) {
    const msg = `${chatWindow.innerHTML}<br />${data.from}: ${data.message}`;
    chatWindow.innerHTML = msg;
}

function broadcastToMembers(data) {
    for (username of members.keys()) {
        try {
            members.get(username).sendChannel.send(JSON.stringify(data));
        } catch {
            continue;
        }
    }
}

////////////////////
// Joining a Chat //
////////////////////


// TODO: is chatName valid message to server
function redirectToChat(chatName) {
    sendToServer({
        type: "join",
        id: chatnameInput.value,
        name: localUsername
    });

    const url = `${window.location.protocol}${window.location.hostname}/chat?=${chatName}`;
    window.location.replace(url);
}


/////////////////////
// Event Listeners //
/////////////////////

// Send Login attempt
loginBtn.addEventListener("click", function(event){ 
    loginInput = document.getElementById('loginInput').value;
    sendToServer({ 
        type: "login", 
        name: loginInput.length > 0 ? loginInput : "anon"
    });
});

messageInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        sendMessageBtn.click();
    }
})

sendMessageBtn.addEventListener("click", function () {
    const data = {
        from: localUsername,
        message: messageInput.value
    };
    if (messageInput.value.length > 0) {
        broadcastToMembers(data);
        updateChatWindow(data);
        messageInput.value = "";
    }
})

joinChatroomBtn.addEventListener("click", function () {
    if (chatnameInput.value.length > 0) {
        chatroomID = chatnameInput.value;
        redirectToChat(chatnameInput.value);
    } else {
        alert("Please enter a valid chatname");
    }
})
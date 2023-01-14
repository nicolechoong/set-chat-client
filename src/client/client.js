import localforage from "https://unpkg.com/localforage@1.9.0/src/localforage.js";

var loginBtn = document.getElementById('loginBtn'); 
var sendMessageBtn = document.getElementById('sendMessageBtn');
var addUserBtn = document.getElementById('addUserBtn');
var removeUserBtn = document.getElementById('removeUserBtn');
var chatMessages = document.getElementById('chatMessages');

var loginInput = document.getElementById('loginInput');
var chatNameInput = document.getElementById('chatNameInput');
var messageInput = document.getElementById('messageInput');
var modifyUserInput = document.getElementById('modifyUserInput');

var connectedUser, localConnection, sendChannel;
var localUsername;

// TODO: massive fucking techdebt of modularising
// TODO: replace getItem/setItem with just gets upon login and periodic sets

//////////////////////
// GLOBAL VARIABLES //
//////////////////////

var enc = new TextEncoder();
var dec = new TextDecoder();

// private keypair for the client
var keyPair;

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

var currentChatID = 0;

// map from username:string to {connection: RTCPeerConnection, sendChannel: RTCDataChannel}
var connections = new Map();

// map from chatID to an array of usernames to connect to
var toConnect = new Map();

// (chatID: String, {chatName: String, members: Array of String})
var joinedChats = new Map();

// local cache : localForage instance
var store;

// map from name to public key : Uint8Array
var keyMap = new Map();

// storing deps for faster access
var hashedOps = new Map();


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
            onLogin(data.success, new Map(JSON.parse(data.joinedChats))); 
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
            break;
        case "createChat":
            onCreateChat(data.chatID, data.chatName, new Map(JSON.parse(data.validMemberPubKeys)), data.invalidMembers);
            break;
        case "add":
            onAdd(data.chatID, data.chatName, data.from, data.fromPK);
            break;
        case "getPK":
            onGetPK(data.name, data.success, data.pubKey);
            break;
        default: 
            break; 
   } 
};
  
// Server approves Login
function onLogin (success, chats) { 

    if (success === false) { 
        alert("oops...try a different username"); 
    } else {
        localUsername = loginInput.value;
        joinedChats = chats;

        keyMap.set(dec.decode(keyPair.publicKey), localUsername);
        updateHeading();
        
        for (const chatID of joinedChats.keys()) {
            updateChatOptions("add", chatID);
        }
    } 
};

function initialiseStore () {
    // new user: creates new store
    // returning user: will just point to the same instance
    console.log(`init store local user: ${localUsername}`);
    store = localforage.createInstance({
        storeName: localUsername
    });
    store.setItem("joinedChats", joinedChats);
}

// Sending Offer to Peer
function sendOffer(peerName, peerPK, chatID) {
    // peerName: String username, peerPK: uInt8Array, chatID: String
    
    if (peerName !== null) { 
        const newConnection = initPeerConnection(peerName);
        connections.set(peerName, {connection: newConnection, sendChannel: null});
        connectionNames.set(newConnection, peerName);
        const peerConnection = connections.get(peerName);

        const channelLabel = {
            senderPK: dec.decode(keyPair.publicKey), 
            receiverPK: dec.decode(peerPK),
            chatID: chatID,
        };
        peerConnection.sendChannel = peerConnection.connection.createDataChannel(JSON.stringify(channelLabel));
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
async function onOffer(offer, peerName) { 
    connections.set(peerName, {connection: initPeerConnection(), sendChannel: null});
    const peerConnection = connections.get(peerName);

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
    connections.get(peerName).connection.setRemoteDescription(answer);
} 
 
// Receiving ICE Candidate from Server
function onCandidate(candidate, peerName) {
    if (connections.has(peerName)) {
        connections.get(peerName).connection.addIceCandidate(new RTCIceCandidate(candidate)); 
    }
}

function onUsernames(usernames) {
    if (usernames.length > 0) {
        document.getElementById('usernames').innerHTML = `Currently Online: ${usernames.join(", ")}`;
    }
}

// Depreciated: For now
function onJoin (usernames) {
    for (peerName of usernames) {
        if (!connections.has(peerName) && peerName !== localUsername) {
            sendOffer(peerName);
        }
    }
}

function onLeave (peerName) {
    connectionNames.delete(connections.get(peerName).connection);
    connections.get(peerName).sendChannel.close();
    connections.get(peerName).connection.close();
    updateChatWindow({from: "SET", message: `${peerName} has left the room`});
    connections.delete(peerName);
}

async function onCreateChat (chatID, chatName, validMemberPubKeys, invalidMembers) {

    joinedChats.set(chatID, {chatName: chatName, members: []});
    store.setItem("joinedChats", joinedChats);
    
    for (const mem of validMemberPubKeys.keys()) {
        keyMap.set(dec.decode(Uint8Array.from(Object.values(validMemberPubKeys.get(mem)))), mem);
        console.log(`adding ${mem} to keyMap`);
    }
    
    if (invalidMembers.length > 0) {
        alert(`The following users do not exist ${invalidMembers}`);
    }

    const createOp = await generateOp("create", chatID);
    const operations = new Set([createOp]);

    store.setItem(chatID, {
        metadata: {
            chatName: chatName,
            operations: operations,
            ignored: []
        },
        history: new Map(),
    }).then(() => {
        addToChat(validMemberPubKeys, chatID);
    });

    updateChatOptions("add", chatID);
    updateHeading();
}

// When being added to a new chat
// (chatID: String, {chatName: String, members: Array of String})
function onAdd (chatID, chatName, from, fromPK) {
    console.log(`you've been added to chat ${chatName} by ${from}`);
    joinedChats.set(chatID, {chatName: chatName, members: []});

    store.setItem(chatID, {
        metadata: {
            chatName: chatName,
            operations: [],
            ignored: []
        },
        history: new Map(),
    });

    // now we have to do syncing to get members and add to store
    keyMap.set(dec.decode(Uint8Array.from(Object.values(fromPK))), from);
    store.setItem("keyMap", keyMap);
    sendOffer(from, Uint8Array.from(Object.values(fromPK)), chatID);
    
    updateChatOptions("add", chatID);
    updateHeading();
}

async function addToChat (validMemberPubKeys, chatID) {
    // members is the list of members pubkey: object
    store.getItem(chatID).then(async (chatInfo) => {
        return new Promise(async (resolve) => {
            for (const mem of validMemberPubKeys.keys()) {
                console.log(`we are now adding ${mem} and the ops are ${chatInfo.metadata.operations}`)
                const op = await generateOp("add", chatID, Uint8Array.from(Object.values(validMemberPubKeys.get(mem))), chatInfo.metadata.operations);
                chatInfo.metadata.operations.push(op);

                const addMessage = {
                    type: "add",
                    op: op,
                    from: dec.decode(keyPair.publicKey),
                    username: mem,
                    chatID: chatID
                };
                broadcastToMembers(addMessage, chatID);
                console.log(`broadcasted add to members`);
                updateChatWindow(addMessage);
                sendToServer({
                    to: mem,
                    type: "add",
                    chatID: chatID,
                    chatName: chatInfo.metadata.chatName
                });
                console.log(`added ${mem}`);
            }
            resolve(chatInfo);
        });
    }).then((chatInfo) => {
        store.setItem(chatID, chatInfo).then(console.log(`${[...validMemberPubKeys.keys()]} have been added to ${chatID}`));
    });
}

function onRemove (chatID, chatName, from, fromPK) {
    console.log(`you've been removed from chat ${chatName} by ${from}`);
    // updateChatOptions("remove", chatID);
    updateHeading();

    // should DISPUTE too
    joinedChats.delete(chatID);

    // as of now we just leave the left chats in the store
}

async function removeFromChat (validMemberPubKeys, chatID) {
    store.getItem(chatID).then(async (chatInfo) => {
        return new Promise(async (resolve) => {
            for (const mem of validMemberPubKeys.keys()) {
                console.log(`we are now removing ${mem} and the ops are ${chatInfo.metadata.operations}`)
                const op = await generateOp("remove", chatID, Uint8Array.from(Object.values(validMemberPubKeys.get(mem))), chatInfo.metadata.operations);
                chatInfo.metadata.operations.push(op);

                const removeMessage = {
                    type: "remove",
                    op: op,
                    username: mem,
                    from: dec.decode(keyPair.publicKey),
                    chatID: chatID
                };
                broadcastToMembers(removeMessage, chatID);
                console.log(`removed ${mem}`);
                updateChatWindow(removeMessage);
            }
            resolve(chatInfo);
        });
    }).then((chatInfo) => {
        store.setItem(chatID, chatInfo).then(console.log(`${[...validMemberPubKeys.keys()]} has been removed from ${chatID}`));
    });
}

function onGetPK (name, success, pk) {
    if (success) {
        const decodedPK = dec.decode(Uint8Array.from(Object.values(pk)));
        console.log(`Received pk of ${name}, ${decodedPK}`);
        keyMap.set(decodedPK, name);
        store.setItem("keyMap", keyMap);
        resolveGetPK(pk);
    } else {
        console.error(`User ${name} does not exist`);
    }
}

//////////////////////////////
// Access Control Functions //
//////////////////////////////

var resolveGetPK;

function getPK (name) {
    return new Promise((resolve) => {
        for (const pk of keyMap) {
            if (name === keyMap.get(pk)) {
                resolve(pk);
            }
        }
        resolveGetPK = resolve;
        console.log(`Requesting for pk of ${name}`);
        sendToServer({
            type: "getPK",
            name: name
        });
    });
}

function getDeps (operations) {
    var deps = [];
    for (const op of operations) {
        const hashedOp = hashOp(op);
        if (op.action === "create" || (op.action !== "create" && !op.deps.includes(hashedOp))) {
            deps.push(hashedOp);
            console.log(`dependency ${op.pk}${op.pk1} ${op.action} ${op.pk2}`);
        }
    }
    return deps;
}

function concatOp (op) {
    return op.action === "create" ? `${op.action}${op.pk}${op.nonce}` : `${op.action}${op.pk1}${op.pk2}${op.deps}`;
}

async function generateOp (action, chatID, pk2 = null, ops = []) {
    // pk is uint8array
    
    return new Promise(function(resolve) {
        var op;
        if (action === "create") {
            op = {
                action: 'create', 
                pk: keyPair.publicKey,
                nonce: nacl.randomBytes(64),
            };
        } else if (action === "add" || action === "remove") {
            console.log(`adding operation ${keyPair.publicKey} ${action}s ${pk2}`);
            op = {
                action: action, 
                pk1: keyPair.publicKey,
                pk2: pk2,
                deps: getDeps(ops)
            };
        }
        op["sig"] = nacl.sign.detached(enc.encode(concatOp(op)), keyPair.secretKey);
            resolve(op);
    });
}

async function sendOperations (chatID, pk) {
    store.getItem(chatID).then((chatInfo) => {
        sendToMember({
            type: "ops",
            ops: chatInfo.metadata.operations,
            chatID: chatID,
            from: dec.decode(keyPair.publicKey),
        }, pk);
    });
}

function unpackOp (op) {
    op.sig = Uint8Array.from(Object.values(op.sig));
    if (op.action === "create") {
        op.pk = Uint8Array.from(Object.values(op.pk));
        op.nonce = Uint8Array.from(Object.values(op.nonce));
    } else {
        op.pk1 = Uint8Array.from(Object.values(op.pk1));
        op.pk2 = Uint8Array.from(Object.values(op.pk2));
        op.deps = op.deps.map(dep => Uint8Array.from(Object.values(dep)));
    }
}

function arrEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) { return false; }
    let index = 0;
    while (index < arr1.length) {
        if (arr1[index] !== arr2[index]) { return false; }
        index++;
    }
    return true;
}

async function receivedOperations (ops, chatID, pk) {
    // ops: array of already unpacked
    // pk: dec.decode(public key of sender)
    console.log(`receiving operations for chatID ${chatID}`);
    store.getItem(chatID).then((chatInfo) => {
        ops = unionOps(chatInfo.metadata.operations, ops2)
        console.log(`merged set of ops ${ops.map(op => JSON.stringify(op))}`)
        const memberSet = members(ops, chatInfo.metadata.ignored);
        console.log(`verified ${verifyOperations(ops)} is member ${memberSet.has(pk)}`);
        if (verifyOperations(ops) && memberSet.has(pk)) {
            chatInfo.metadata.operations = ops;
            joinedChats.get(chatID).members = memberSet;

            store.setItem(chatID, chatInfo);
            console.log(`synced with ${keyMap.get(pk)}`);
            sendAdvertisement(chatID, pk);
        }
    });
}

// takes in set of ops
function verifyOperations (ops) {
    
    // only one create
    const createOps = ops.filter((op) => op.action === "create");
    if (createOps.length != 1) { console.log("op verification failed: more than one create"); return false; }
    const createOp = createOps[0];
    if (!nacl.sign.detached.verify(enc.encode(concatOp(createOp)), createOp.sig, createOp.pk)) { console.log("op verification failed: create key verif failed"); return false; }

    const otherOps = ops.filter((op) => op.action !== "create");
    const hashedOps = ops.map((op) => dec.decode(hashOp(op)));

    for (const op of otherOps) {
        // valid signature
        if (!nacl.sign.detached.verify(enc.encode(concatOp(op)), op.sig, op.pk1)) { console.log("op verification failed: key verif failed"); return false; }

        // non-empty deps and all hashes in deps resolve to an operation in o
        for (const dep of op.deps) {
            if (!hashedOps.includes(dec.decode(dep))) { console.log("op verification failed: missing dep"); return false; } // as we are transmitting the whole set
        }
    }

    return true;
}

function hashOp(op) {
    return nacl.hash(enc.encode(concatOp(op)));
}

function getOpFromHash(ops, hashedOp) {
    if (hashedOps.has(dec.decode(hashedOp))) { return hashedOps.get(dec.decode(hashedOp)); }
    for (const op of ops) {
        if (arrEqual(hashedOp, hashOp(op))) {
            hashedOps.set(dec.decode(hashedOp), op);
            return op;
        }
    }
}

// takes in set of ops
function precedes (ops, op1, op2) {
    if (!ops.has(op2) || !ops.has(op1)) { return false; } // TODO
    const toVisit = [op2];
    const target = hashOp(op1);
    var curOp;
    var dep;
    while (toVisit.length > 0) {
        curOp = toVisit.shift();
        for (const hashedDep of curOp.deps) {
            if (arrEqual(hashedDep, target)) {
                return true;
            } else {
                dep = getOpFromHash(ops, hashedDep);
                if (dep.action !== "create") {
                    toVisit.push(dep);
                }
            }
        }
    }
    return false;
}

function concurrent (ops, op1, op2) {
    if (!ops.has(op1) || !ops.has(op2) || arrEqual(op1.sig, op2.sig) || precedes(ops, op1, op2) || precedes(ops, op2, op1)) { return false; }
    return true;
}

function authority (ops) {
    const edges = new Set();
    var pk;
    // convert pk into strings to perform comparisons
    for (const op1 of ops) {
        for (const op2 of ops) {
            if (op2.action === "create") { continue; }
            if ((((op1.action === "create" && arrEqual(op1.pk, op2.pk1)) || (op1.action === "add" && arrEqual(op1.pk2, op2.pk1))) && precedes(ops, op1, op2))
                || ((op1.action === "remove" && arrEqual(op1.pk2, op2.pk1)) && (precedes(ops, op1, op2) || concurrent(ops, op1, op2)))) {
                edges.add([op1, op2]);
            }
        }

        pk = op1.action == "create" ? op1.pk : op1.pk2;
        edges.add([op1, {"member": pk, "sig": pk}]); // TODO: remove dups
    }

    return edges;
}

function valid (ops, ignored, op) {
    ops = new Set(ops);
    if (op.action === "create") { return true; }
    if (ignored.has(op)) { return false; }
    const inSet = ([...authority(ops)]).filter((edge) => {
        
        return arrEqual(op.sig, edge[1].sig) && valid(ops, ignored, edge[0]);
    }).map(edge => edge[0]);
    const removeIn = inSet.filter(r => (r.action === "remove"));
    for (const opA of inSet) {
        if (opA.action === "create" || opA.action === "add") {
            if (removeIn.filter(opR => precedes(ops, opA, opR)).length === 0) {
                return true; 
            }
        }
    }
    return false;
}

function members (ops, ignored) {
    const pks = new Set();
    var pk;
    for (const op of ops) {
        pk = op.action === "create" ? op.pk : op.pk2;
        if (valid(ops, ignored, {"member": pk, "sig": pk})) {
            pks.add(dec.decode(pk));
        }
    }
    console.log(`calculated member set ${[...pks]}      number of members ${pks.size}}`);
    return pks;
}


////////////////////////////
// Peer to Peer Functions //
////////////////////////////

function joinChat (chatID) {
    if (currentChatID !== chatID) {
        currentChatID = chatID;
        for (peerPK of joinedChats.get(chatID).members) {
            if (peerPK !== dec.decode(keyPair.publicKey)) {
                // Insert Key Exchange Protocol
                console.log(`peerPK is ${peerPK}`);
                sendOffer(peerName, peerPK, chatID);
            }
        }
    }
}

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
                    chatroomID: currentChatID
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
        const channelLabel = JSON.parse(event.target.label);
        console.log(`the public key we will send ops to is ${channelLabel.senderPK === dec.decode(keyPair.publicKey) ? channelLabel.receiverPK : channelLabel.senderPK}`);
        sendOperations(channelLabel.chatID, channelLabel.senderPK === dec.decode(keyPair.publicKey) ? channelLabel.receiverPK : channelLabel.senderPK);
    }
    channel.onclose = (event) => { console.log(`Channel ${event.target.label} closed`); }
    channel.onmessage = (event) => {
        console.log(`received a message from the channel`);
        const messageData = JSON.parse(event.data);
        switch (messageData.type) {
            case "ops":
                messageData.ops.forEach(op => unpackOp(op));
                receivedOperations(messageData.ops, messageData.chatID, messageData.from);
                break;
            case "advertisement":
                onAdvertisement(messageData.chatID, messageData.online);
                break;
            case "add":
            case "remove":
                unpackOp(messageData.op);
                keyMap.set(dec.decode(messageData.op.pk1), messageData.username);
                keyMap.set(dec.decode(messageData.op.pk2), messageData.username);
                store.setItem("keyMap", keyMap);
                receivedOperations([messageData.op], messageData.chatID, messageData.from);
            case "text":
                updateChatWindow(messageData);
                break;
            default:
                console.log(`Unrecognised message type ${messageData.type}`);
        }
    }
}

function receiveChannelCallback (event) {
    const channelLabel = JSON.parse(event.channel.label);
    console.log(`Received channel ${event.channel.label} from ${channelLabel.senderPK}`);
    const peerConnection = connections.get(keyMap.get(channelLabel.senderPK));
    peerConnection.sendChannel = event.channel;
    initChannel(peerConnection.sendChannel);
}

function sendAdvertisement (chatID, pk) {
    // chatID: String, pk: dec.decode(pk)
    const online = [];
    for (const mem of joinedChats.get(chatID).members) {
        if (connections.has(keyMap.get(mem)) && mem !== pk) {
            online.push({peerName: keyMap.get(mem), peerPK: enc.encode(mem)});
        }
    }

    if (online.length > 0) {
        console.log(`sending an advertistment to ${pk} of ${online}`)
        sendToMember({
            type: "advertisement",
            online: online,
            chatID: chatID
        }, pk);
    }
}

function onAdvertisement (chatID, online) {
    var peerPK;
    for (const peer of online) {
        peerPK = Uint8Array.from(Object.values(peer.peerPK));
        keyMap.set(dec.decode(peerPK), peer.peerName);
        store.setItem("keyMap", keyMap);
        if (!connections.has(dec.decode(peerPK))) {
            console.log(`peerPK ${peerPK}   is of uint8array ${peerPK instanceof Uint8Array}`);
            sendOffer(peer.peerName, peerPK, chatID);
        }
    }
}

function updateChatWindow (data) {
    if (data.chatID === currentChatID) {
        var message;
        switch (data.type) {
            case "text":
                message = `${keyMap.get(data.from)}: ${data.message}`;
                break;
            case "add":
                message = `${keyMap.get(dec.decode(data.op.pk1))} added ${keyMap.get(dec.decode(data.op.pk2))}`;
                break;
            case "remove":
                message = `${keyMap.get(dec.decode(data.op.pk1))} removed ${keyMap.get(dec.decode(data.op.pk2))}`;
                break;
            default:
                message = "";
                break;
        }
        const msg = `${chatMessages.innerHTML}<br />[${new Date(data.sentTime).toISOString()}] ${message}`;
        chatMessages.innerHTML = msg;
    }
}

function updateChatStore (messageData) {
    store.getItem(messageData.chatID).then((chatInfo) => {
        chatInfo.history.set(messageData.id, messageData);
        store.setItem(chatID, chatInfo);
    }).then(() => {
        console.log("updated chat store");
    });
}

function sendToMember (data, pk) {
    console.log(`sending ${JSON.stringify(data.type)}   to ${keyMap.get(pk)}`);
    console.log(`current state of keyMap ${[...keyMap.values()]}`)
    const sentTime = Date.now();
    data.sentTime = sentTime;
    data.id = nacl.hash(enc.encode(`${localUsername}:${sentTime}`));
    connections.get(keyMap.get(pk)).sendChannel.send(JSON.stringify(data));
}

function broadcastToMembers (data, chatID = null) {
    chatID = chatID === null ? currentChatID : chatID;
    console.log(`username broadcast ${[...joinedChats.get(chatID).members]}`);
    for (const pk of joinedChats.get(chatID).members) {
        try {
            console.log(`sending ${data} to ${keyMap.get(pk)}`);
            sendToMember(data, pk);
        } catch {
            continue;
        }
    }
}

function sendChatMessage (messageInput) {
    console.log("message sent");
    const data = {
        type: "text",
        from: dec.decode(keyPair.publicKey),
        message: messageInput,
        chatID: currentChatID
    };

    broadcastToMembers(data);
    // updateChatStore(currentChatID, data);
    updateChatWindow(data);
}


/////////////////////
// Event Listeners //
/////////////////////

// Send Login attempt
loginBtn.addEventListener("click", async function (event) { 
    localUsername = loginInput.value;
    console.log(localUsername);

    initialiseStore();

    store.getItem("keyPair").then((kp) => {
        if (kp === null) {
            keyPair = nacl.sign.keyPair();
            console.log("keyPair generated");
            store.setItem("keyPair", keyPair);
            store.setItem("keyMap", keyMap);  // TODO: worry about what if we log out
        } else {
            console.log(`keypair ${JSON.stringify(kp)}`);
            keyPair = kp;
        }

        if (localUsername.length > 0 && isAlphanumeric(localUsername)) {
            sendToServer({ 
                type: "login", 
                name: localUsername,
                pubKey: keyPair.publicKey
            });
        }
    });
});

messageInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        sendMessageBtn.click();
    }
})

sendMessageBtn.addEventListener("click", function () {
    if (messageInput.value.length > 0) {
        sendChatMessage(messageInput.value);
        messageInput.value = "";
    }
})

chatNameInput.addEventListener("change", selectChat);

newChatBtn.addEventListener("click", createNewChat);

addUserBtn.addEventListener("click", async () => {
    if (currentChatID === 0) { console.alert(`Please select a chat`); return; }
    const username = modifyUserInput.value;
    const pk = await getPK(username);
    modifyUserInput.value = "";
    if (joinedChats.get(currentChatID).members.has(pk)) { console.alert(`User has already been added`); return; }
    addToChat(new Map([[username, pk]]), currentChatID);
});

removeUserBtn.addEventListener("click", async () => {
    if (currentChatID === 0) { console.alert(`Please select a chat`); return; }
    const username = modifyUserInput.value;
    const pk = await getPK(username);
    modifyUserInput.value = "";
    if (!joinedChats.get(currentChatID).members.has(pk)) { console.alert(`Invalid username`); return; };
    removeFromChat(new Map([[username, pk]]), currentChatID);
});

function getChatNames() {
    var chatnames = [];
    for (const chatID of joinedChats.keys()) {
        chatnames.push(joinedChats.get(chatID).chatName);
    }
    return chatnames;
}

function getChatID(chatName) {
    console.log(Array.from(joinedChats.keys()));
    for (const chatID of joinedChats.keys()) {
        console.log(chatID);
        if (chatName === joinedChats.get(chatID).chatName) {
            return chatID;
        }
    }
    return -1;
}

function updateHeading() {
    const title = document.getElementById('heading');
    title.innerHTML = `I know this is ugly, but Welcome ${localUsername}`;
    if (joinedChats.size > 0) {
        const availableChats = document.getElementById('availableChats');
        availableChats.innerHTML = `Chats: ${getChatNames().join(", ")}`;
    }
}

function selectChat() {
    const index = chatNameInput.selectedIndex;

    if (index > 0) {
        const chatName = chatNameInput.options.item(index).text;
        currentChatID = getChatID(chatName);
        console.log(`trying to join chatID ${currentChatID}`);

        const chatTitle = document.getElementById('chatHeading');
        chatTitle.innerHTML = `Chat: ${chatName}`;
        chatMessages.innerHTML = "";
        var msg = "";
        store.getItem(currentChatID).then((chatInfo) => {
            for (const mid of chatInfo.history.keys()) {
                const data = chatInfo.history.get(mid);
                msg = `${msg}<br />[${data.setTime}] ${data.from}: ${data.message}`
            }
            chatMessages.innerHTML = msg;
        });
        joinChat(currentChatID);
    }
}

// TODO: distinguish between same name different chat
function updateChatOptions(operation, chatID) {
    var option = document.createElement("option");

    if (operation === "add") {
        option.text = joinedChats.get(chatID).chatName;
        chatNameInput.options.add(option);
    } else if (operation === "remove") {
        if (!chatOptions.includes(chatID)) {
            console.error(`Chat does not exist`);
        }
        const index = [...joinedChats.keys()].indexOf(chatID);
        chatNameInput.options.remove(index);
    }
}

function createNewChat() {
    let newChatName = document.getElementById('newChatName').value;
    let member1 = document.getElementById('member1').value;
    let member2 = document.getElementById('member2').value;

    sendToServer({ 
        type: "createChat", 
        chatName: newChatName,
        members: [member1, member2]
    });
}

////////////
// UTILS  //
////////////

function isAlphanumeric (str) {
    return str === str.replace(/[^a-z0-9]/gi,'');
}

function unionOps (ops1, ops2) {
    const sigSet = new Set(ops1.map(op => op.sig));
    const ops = JSON.parse(JSON.stringify(ops1));
    for (const op of ops2) {
        if (!sigSet.has(op.sig)) { ops.push(op); }
    }
    return ops;
}
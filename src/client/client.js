import localforage from "https://unpkg.com/localforage@1.9.0/src/localforage.js";
import nacl from '../../node_modules/tweetnacl-es6/nacl-fast-es.js';
import * as access from "./accessControl.js";
import * as elem from "./components.js";
import {strToArr, concatArr, formatDate, isAlphanumeric, arrToStr, unionOps} from "./utils.js";

const loginBtn = document.getElementById('loginBtn');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const addUserBtn = document.getElementById('addUserBtn');
const disputeBtn = document.getElementById('disputeBtn');
const acceptRemovalBtn = document.getElementById('acceptRemovalBtn');
const newChatBtn = document.getElementById('newChatBtn');
const resetStoreBtn = document.getElementById('resetStoreBtn');
const connectBtn = document.getElementById('connectBtn');
const chatBox = document.getElementById('chatBox');

const chatList = document.getElementById('chatList');
const memberList = document.getElementById('memberList');
const conflictCardList = document.getElementById('conflictCardList');

const chatBar = document.getElementById('chatBar');
const disabledChatBar = document.getElementById('disabledChatBar');
const conflictChatBar = document.getElementById('conflictChatBar');
const chatWindow = document.getElementById('chatWindow');
const wifiSlash = document.getElementById('wifiSlash');

const loginInput = document.getElementById('loginInput');
const messageInput = document.getElementById('messageInput');
const addUserInput = document.getElementById('addUserInput');

var localUsername;

//////////////////////
// GLOBAL VARIABLES //
//////////////////////

var currentChatID, connections, msgQueue, serverValue, sessionKeys, acks, peerIgnored;
var onSIGMA2, onSIGMA3; // for SIGMA protocol
var onlineMode = false;
export var joinedChats, keyMap, store;

const enc = new TextEncoder();

// private keypair for the client
export var keyPair;

// connection to stringified(peerPK)
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

function initialiseClient () {
    store = null;
    currentChatID = 0;
    connections = new Map(); // map from stringify(pk):string to {connection: RTCPeerConnection, sendChannel: RTCDataChannel}
    joinedChats = new Map(); // (chatID: String, {chatName: String, members: Array of String})
    keyMap = new Map(); // map from public key : stringify(pk) to username : String
    msgQueue = [];
    sessionKeys = new Map();
    onSIGMA2 = new Map();
    onSIGMA3 = new Map();
    acks = new Set();
    peerIgnored = new Map();

    // layout
    [...chatList.childNodes].forEach((node) => {
        if (node.id !== "chatCardTemplate") {
            chatList.removeChild(node);
        }
    });
    document.getElementById('heading').innerHTML = "Hello I am a Chat";
    document.getElementById('defaultText').style.display = "block";
    document.getElementById('chatInfo').style.display = "none";
    document.getElementById('chatBoxHeading').style.display = "none";
    [...document.getElementsByClassName('chat-bar')].forEach((elem) => {
        elem.style.display = "none";
    });
    chatWindow.style.display = 'none'; 
    chatWindow.innerHTML = '<div id="anchor" style="overflow-anchor: auto; min-height: 1px; height: 1px" ></div>';
    currentChatID = 0;

    dim.style.display = "block";
    loginPopup.style.display = "flex";
    loginInput.focus();
    loginInput.select();
}

initialiseClient();

/////////////////////////
// WebSocket to Server //
/////////////////////////

var connection;
// var connection = new WebSocket('wss://localhost:3000');

function connectToServer () {
    connection = new WebSocket('wss://35.178.80.94:3000/');
    wifiSlash.style.display = "none";

    connection.onopen = function () {
        console.log("Connected to server");
        onlineMode = true;
    };

    connection.onerror = function (err) {
        console.log("Error: ", err);
        alert("Please authorise wss://35.178.80.94:3000/ on your device before refreshing! ")
    };

    connection.onmessage = async function (message) {
        console.log("Got message", message.data);
        var data = JSON.parse(message.data);

        switch (data.type) {
            case "SIGMA1":
                serverValue = strToArr(data.value);
                break;
            case "SIGMA3":
                onSIGMA3.get(connection)(data);
                break;
            case "login":
                onLogin(data.status, data.username, new Map(data.joinedChats));
                break;
            case "offer":
                onOffer(data.offer, data.from, data.fromPK);
                break;
            case "answer":
                onAnswer(data.answer, data.fromPK);
                break;
            case "candidate":
                onCandidate(data.candidate, data.from);
                break;
            case "connectedUsers":
                onConnectedUsers(data.usernames);
                break;
            case "join":
                onJoin(data.usernames);
                break;
            case "leave":
                onLeave(data.from);
                break;
            case "createChat":
                onCreateChat(data.chatID, data.chatName);
                break;
            case "add":
                // data.ignored.forEach(ig => unpackOp(ig));
                onAdd(data.chatID, data.chatName, data.from, data.ignored, data);
                break;
            case "remove":
                onRemove(data);
                break;
            case "getUsername":
                onGetUsername(data.username, data.success, data.pk);
                break;
            case "getPK":
                onGetPK(data.username, data.success, data.pk);
                break;
            case "getOnline":
                onGetOnline(data.online, data.chatID);
                break;
            case "peerOffline":
                offerSent.delete(data.pk);
                break;
            default:
                break;
        }
    };
}

connectToServer();

function sendToServer(message) {
    console.log(`online mode ${onlineMode} message ${JSON.stringify(message)}`);
    if (onlineMode) {
        connection.send(JSON.stringify(message));
    } else {
        msgQueue.push(message);
    }
};

// unique application identifier ('set-chat-client')
const setAppIdentifier = new Uint8Array([115, 101, 116, 45, 99, 104, 97, 116, 45, 99, 108, 105, 101, 110, 116]);

async function onSIGMA1 (peerValue, connection) {
    // peerValue: Uint8Array
    return new Promise(async (resolve) => {
        const localKeyPair = nacl.box.keyPair();
        const localValue = localKeyPair.publicKey;
        const sessionKey = nacl.box.before(peerValue, localKeyPair.secretKey);
        const macKey = nacl.hash(concatArr(setAppIdentifier, sessionKey));

        console.log(`confused ${connection instanceof RTCDataChannel}`);
        connection.send(JSON.stringify({
            type: "SIGMA2",
            value: arrToStr(localValue), // Uint8Array
            pk: keyPair.publicKey, // string
            sig: arrToStr(nacl.sign.detached(concatArr(peerValue, localValue), keyPair.secretKey)), // verifying secret key possession 
            mac: arrToStr(access.hmac512(macKey, strToArr(keyPair.publicKey))) // verifying identity
        }));

        const res = await new Promise((res2) => { onSIGMA3.set(connection, res2); });
        switch (res.status) {
            case "SUCCESS":
                const peerPK = strToArr(res.pk);
                if (nacl.sign.detached.verify(concatArr(localValue, peerValue), strToArr(res.sig), peerPK)
                && nacl.verify(strToArr(res.mac), access.hmac512(macKey, peerPK))) {
                    resolve(true);
                    if (connections.has(res.pk)) {
                        connections.get(res.pk).auth = true;
                    }
                }
                break;
            case "PK_IN_USE":
                alert("This username is being used on another tab. Please try a different username.");
                store = null;
                break;
            case "VERIF_FAILED":
                alert('Key exchange failed');
                resolve(false);
                closeConnections(res.pk);
        }
    });
}

// Server approves Login
async function onLogin (status, username, receivedChats) {

    switch (status) {
        case "SUCCESS":
            localUsername = username;
            joinedChats = mergeJoinedChats(joinedChats, new Map());
            store.setItem("joinedChats", joinedChats);
    
            store.getItem("keyMap").then((storedKeyMap) => {
                keyMap = storedKeyMap === null ? new Map() : storedKeyMap;
                keyMap.set(keyPair.publicKey, localUsername);
                store.setItem("keyMap", keyMap);
            });
            store.getItem("msgQueue").then((storedMsgQueue) => {
                msgQueue = storedMsgQueue === null ? [] : storedMsgQueue;
            });
    
            loginPopup.style.display = "none";
            dim.style.display = "none";
            document.getElementById('heading').innerHTML = `I know this is ugly, but Welcome ${localUsername}`;
    
            for (const chatID of joinedChats.keys()) {
                console.log(chatID, joinedChats.get(chatID));
                updateChatOptions("add", chatID);
                getOnline(chatID);
            }
    
            for (const msg of msgQueue) {
                sendToServer(msg);
            }
            return;
        case "NAME_TAKEN":
            alert("This username is associated with another device. Please try a different username.");
            return;
        case "VERIF_FAILED":
            alert("Failed to verify identity. Please try a different username.");
            return;
    }
};

async function initialiseStore(username) {
    // new user: creates new store
    // returning user: will just point to the same instance
    console.log(`init store local user: ${username}`);
    store = localforage.createInstance({
        storeName: arrToStr(nacl.hash(enc.encode(username)))
    });
    
    localforage.ready().then(() => {
        store.getItem("joinedChats").then(async (chats) => {
            if (chats === null) {
                joinedChats = [];
            } else {
                joinedChats = chats;
            }
            await store.setItem("joinedChats", joinedChats).then(console.log(`store initialised to ${joinedChats}`));
        });
    });
}

var offerSent = new Set()

// Sending Offer to Peer
function sendOffer(peerName, peerPK) {
    // peerName: String username, peerPK: string

    if (peerName !== null && peerPK !== null) {
        const newConnection = initPeerConnection(peerName);
        connections.set(peerPK, { connection: newConnection, sendChannel: null, auth: false });
        connectionNames.set(newConnection, peerPK);
        const peerConnection = connections.get(peerPK);

        const channelLabel = {
            senderPK: keyPair.publicKey,
            receiverPK: peerPK
        };
        peerConnection.sendChannel = peerConnection.connection.createDataChannel(JSON.stringify(channelLabel));
        initChannel(peerConnection.sendChannel);
        console.log(`Created sendChannel for ${localUsername}->${peerName}`);

        console.log(`Sending offer to ${peerName}`);
        peerConnection.connection.createOffer(function (offer) {
            sendToServer({
                to: peerPK,
                fromPK: keyPair.publicKey,
                from: localUsername,
                type: "offer",
                offer: offer
            });

            peerConnection.connection.setLocalDescription(offer);
        }, function (error) {
            alert("An error has occurred.");
        });
        offerSent.add(peerPK);
    }
};


// Receiving Offer + Sending Answer to Peer
async function onOffer(offer, peerName, peerPK) {
    // offer: JSON, peerName: String, peerPK: string
    if (!offerSent.has(peerPK) && connections.has(peerPK)) { return; }

    connections.set(peerPK, { connection: initPeerConnection(), sendChannel: null, auth: false });
    const peerConnection = connections.get(peerPK);

    keyMap.set(peerPK, peerName);
    store.setItem("keyMap", keyMap);
    peerConnection.connection.setRemoteDescription(offer);

    console.log(`Sending answer to ${peerName}`);
    peerConnection.connection.createAnswer(function (answer) {
        peerConnection.connection.setLocalDescription(answer);
        sendToServer({
            to: peerPK,
            fromPK: keyPair.publicKey,
            from: localUsername,
            type: "answer",
            answer: answer
        });
    }, function (error) {
        alert("oops...error");
    });
}

// Receiving Answer from Peer
function onAnswer(answer, peerPK) {
    connections.get(peerPK).connection.setRemoteDescription(answer);
    offerSent.delete(peerPK);
}

// Receiving ICE Candidate from Server
function onCandidate(candidate, peerPK) {
    peerPK = peerPK;
    if (connections.has(peerPK)) {
        connections.get(peerPK).connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

function onConnectedUsers(usernames) {
    
}

// Depreciated: For now
function onJoin(usernames) {
    for (peerName of usernames) {
        if (!connections.has(peerName) && peerName !== localUsername) {
            sendOffer(peerName);
        }
    }
}

function onLeave(peerPK) {
    // peerPK : string
    closeConnections(peerPK, 0, true);
}

async function onCreateChat(chatID, chatName) {

    joinedChats.set(chatID, {
        chatName: chatName,
        validMembers: new Set([keyPair.publicKey]),
        members: [keyPair.publicKey],
        exMembers: new Set(),
        peerIgnored: new Map(),
        currentMember: true,
        toDispute: null
    });
    await store.setItem("joinedChats", joinedChats);

    const createOp = access.generateCreateOp();
    const operations = [createOp];

    const createMsg = addMsgID({
        type: "create",
        from: keyPair.publicKey,
        op: createOp,
        chatID: chatID,
    });

    await store.setItem(chatID, {
        metadata: {
            chatName: chatName,
            operations: operations,
            ignored: [],
            unresolved: [],
        },
        history: [createMsg],
        historyTable: new Map(),
    }).then(async () => {
        updateChatOptions("add", chatID);
        await selectChat(chatID);
    });
}

// When being added to a new chat
async function onAdd(chatID, chatName, fromPK, ignored, msg) {
    // chatID: String, chatName: String, from: String, fromPK: Uint8Array, msgID: 

    // we want to move this actual joining to after syncing with someone from the chat
    const from = await getUsername(fromPK);
    console.log(`you've been added to chat ${chatName} by ${from}`);

    if (!joinedChats.has(chatID)) {
        joinedChats.set(chatID, {
            chatName: chatName,
            validMembers: new Set([fromPK]),
            members: [fromPK],
            exMembers: new Set(),
            peerIgnored: new Map(),
            currentMember: false,
            toDispute: null
        });
        await store.setItem("joinedChats", joinedChats);

        await store.setItem(chatID, {
            metadata: {
                chatName: chatName,
                operations: [msg.op],
                ignored: ignored,
                unresolved: [],
            },
            history: [msg],
            historyTable: new Map(),
        });

        initChatHistoryTable(chatID, msg.id);
    }

    if (connections.has(fromPK)) {
        sendOperations(chatID, fromPK);
    } else {
        if (!(await connectToPeer({ peerName: from, peerPK: fromPK }))) {
            if (!getOnline(chatID)) {
                console.log(`no one is online :(`);
            }
        }
    }
}

async function addToChat (name, pk, chatID) {
    // members is the list: username: string, pk: string
    store.getItem(chatID).then(async (chatInfo) => {
        console.log(`we are now adding ${name} who has pk ${pk} and the ops are ${chatInfo.metadata.operations}`);
        const op = access.generateOp("add", pk, chatInfo.metadata.operations);
        chatInfo.metadata.operations.push(op);

        const addMessage = addMsgID({
            type: "add",
            op: op,
            ignored: chatInfo.metadata.ignored,
            from: keyPair.publicKey,
            username: name,
            chatID: chatID,
            chatName: chatInfo.metadata.chatName
        });

        joinedChats.get(chatID).validMembers.add(pk);
        joinedChats.get(chatID).members.push(pk);
        await store.setItem("joinedChats", joinedChats);
        await store.setItem(chatID, chatInfo).then(console.log(`${name} has been added to ${chatID}`));
        broadcastToMembers(addMessage, chatID);
        sendToServer({
            to: pk,
            type: "add",
            msg: addMessage
        });
    });
}


async function onRemove (messageData) {
    const fromPK = messageData.from;
    var joinedChatInfo = joinedChats.get(messageData.chatID);

    if (fromPK !== keyPair.publicKey) {
        updateChatWindow(messageData);
        await updateChatStore(messageData);

        await store.getItem(messageData.chatID).then(async (chatInfo) => {
            chatInfo.metadata.operations = access.verifiedOperations([messageData.op], chatInfo.metadata.operations, chatInfo.metadata.unresolved);
            await store.setItem(messageData.chatID, chatInfo);
        });

        if (messageData.dispute && joinedChatInfo.exMembers.has(fromPK)) {
            joinedChatInfo.members.forEach((pk) => sendOperations(messageData.chatID, pk, true));

        } else if (joinedChatInfo.currentMember && joinedChatInfo.members.includes(fromPK)) {
            joinedChatInfo.currentMember = false;

            joinedChatInfo.toDispute = { peerName: await getUsername(fromPK), peerPK: fromPK };

            if (joinedChatInfo.members.includes(keyPair.publicKey)) {
                joinedChatInfo.members.splice(joinedChatInfo.members.indexOf(keyPair.publicKey), 1);
            }
            joinedChatInfo.exMembers.add(keyPair.publicKey);
            await store.setItem("joinedChats", joinedChats);

            await store.getItem(messageData.chatID).then(async (chatInfo) => {
                for (const pk of joinedChats.get(messageData.chatID).members) {
                    if (chatInfo.historyTable.has(pk)) {
                        const interval = chatInfo.historyTable.get(pk).pop();
                        interval[1] = interval[1] == 0 ? messageData.id : interval[1];
                        chatInfo.historyTable.get(pk).push(interval);
                    }
                }
                await store.setItem(messageData.chatID, chatInfo);
            });

            if (document.getElementById(`userCard${localUsername}`)) { document.getElementById(`userCard${localUsername}`).remove(); }
            disableChatMods(messageData.chatID);
            
            console.log(`you've been removed from chat ${joinedChatInfo.chatName} by ${await getUsername(fromPK)}`);

            for (const pk of joinedChatInfo.members) {
                closeConnections(pk, messageData.chatID, true);
            }
        }
    }
}

export async function removeFromChat (username, pk, chatID) {
    // username : string, public key : string, chatID : string
    store.getItem(chatID).then(async (chatInfo) => {
        console.log(`we are now removing ${username} and the ops are ${chatInfo.metadata.operations.map(op => op.action)}`);
        const op = access.generateOp("remove", pk, chatInfo.metadata.operations);
        chatInfo.metadata.operations.push(op);
        await store.setItem(chatID, chatInfo).then(console.log(`${username} has been removed from ${chatID}`));

        const removeMessage = addMsgID({
            type: "remove",
            op: op,
            username: username,
            from: keyPair.publicKey,
            chatID: chatID,
            dispute: false
        });
        broadcastToMembers(removeMessage, chatID);
        sendToServer({
            to: pk,
            type: "remove",
            msg: removeMessage
        });
    });
}

async function disputeRemoval(peer, chatID) {
    await store.getItem(chatID).then(async (chatInfo) => {
        const end = chatInfo.metadata.operations.findLastIndex((op) => op.action === "remove" && op.pk2 === keyPair.publicKey);
        console.log(end);
        const ignoredOp = chatInfo.metadata.operations.at(end);
        console.log(`we are now disputing ${peer.peerName} and the ops are ${chatInfo.metadata.operations.slice(0, end).map(op => op.action)}`);
        const op = access.generateOp("remove", peer.peerPK, chatInfo.metadata.operations.slice(0, end));

        // console.log(`${chatInfo.history.map(msg => msg.type)}`);
        // const ignoredOpIndex = chatInfo.history.findIndex(msg => msg.type == ignoredOp.action && msg.op.sig === ignoredOp.sig);
        // if (ignoredOpIndex > -1) {
        //     chatInfo.history.splice(ignoredOpIndex);
        // }

        chatInfo.metadata.operations.push(op);
        chatInfo.metadata.ignored.push(ignoredOp);
        await store.setItem(chatID, chatInfo);
        await refreshChatWindow(chatID);

        chatInfo.metadata.operations.forEach(op => {
            console.log(`${op.action} ${keyMap.get(op.pk2)}`);
        });

        const removeMessage = addMsgID({
            type: "remove",
            op: op,
            username: peer.peerName,
            from: keyPair.publicKey,
            chatID: chatID,
            dispute: true,
        });

        sendToMember(removeMessage, keyPair.publicKey, false);
        // broadcastToMembers(removeMessage, chatID);
        sendToServer({
            to: peer.peerPK,
            type: "remove",
            msg: removeMessage
        });
        
        const oldMembers = [...joinedChats.get(chatID).members];
        console.log(joinedChats.get(chatID).members);
        await updateMembers(await access.members(chatInfo.metadata.operations, chatInfo.metadata.ignored), chatID);
        for (const mem of oldMembers) {
            connectToPeer({ peerName: await getUsername(mem), peerPK: mem });
        }
    });
}

var resolveGetUsername = new Map();
var rejectGetUsername = new Map();

function onGetUsername(name, success, pk) {
    // name: String, success: boolean, pk: string
    if (success) {
        keyMap.set(pk, name);
        store.setItem("keyMap", keyMap);
        if (resolveGetUsername.has(pk)) {
            resolveGetUsername.get(pk)(name);
        }
    } else {
        rejectGetUsername.get(pk)(new Error("User does not exist"));
        console.error(`User ${name} does not exist`);
    }
    resolveGetUsername.delete(pk);
    rejectGetUsername.delete(pk);
}

function getUsername(pk) {
    // pk: stringified(pk)
    return new Promise((resolve, reject) => {
        if (keyMap.has(pk)) {
            resolve(keyMap.get(pk));
            return;
        }
        resolveGetUsername.set(pk, resolve);
        rejectGetUsername.set(pk, reject);
        sendToServer({
            type: "getUsername",
            pk: pk
        });
    });
}

function onGetPK(name, success, pk) {
    // name: String, success: boolean, pk: Uint8Array
    if (success) {
        keyMap.set(pk, name);
        store.setItem("keyMap", keyMap);
        resolveGetPK.get(name)(pk);
    } else {
        rejectGetPK.get(name)(new Error("User does not exist"));
        console.error(`User ${name} does not exist`);
    }
    resolveGetPK.delete(name);
    rejectGetPK.delete(name);
}

async function onGetOnline(online, chatID) {
    if (online.length == 0) {
        resolveGetOnline.get(chatID)(false);
    }
    online.sort((a, b) => {
        if (!joinedChats.get(chatID).members.includes(a) && joinedChats.get(chatID).members.includes(b)) {
            return 1
        } else if (!joinedChats.get(chatID).members.includes(a) && joinedChats.get(chatID).members.includes(b)) {
            return -1
        } else {
            return 0
        }
    });
    for (const peer of online) {
        if (await connectToPeer(peer)) {
            resolveGetOnline.get(chatID)(true);
            break;
        }
    }
    resolveGetOnline.get(chatID)(false);
    resolveGetOnline.delete(chatID);
}

var resolveGetOnline = new Map();

function getOnline (chatID) {
    return new Promise((resolve) => {
        resolveGetOnline.set(chatID, resolve);
        sendToServer({
            type: "getOnline",
            pk: keyPair.publicKey,
            chatID: chatID
        });
    });
}

//////////////////////////////
// Access Control Functions //
//////////////////////////////

var resolveGetPK = new Map();
var rejectGetPK = new Map();

function getPK(username) {
    return new Promise((resolve, reject) => {
        for (const pk of keyMap) {
            if (username == keyMap.get(pk)) {
                resolve(pk);
                return;
            }
        }
        resolveGetPK.set(username, resolve);
        rejectGetPK.set(username, reject);
        sendToServer({
            type: "getPK",
            username: username
        });
    });
}

async function sendOperations(chatID, pk, ack=false) {
    // chatID : String, pk : String
    console.log(`sending operations to ${keyMap.get(pk)}`);
    store.getItem(chatID).then((chatInfo) => {
        sendToMember(addMsgID({
            type: "ops",
            ops: chatInfo.metadata.operations,
            chatID: chatID,
            from: keyPair.publicKey,
            sigmaAck: ack
        }), pk);
    });
}

async function sendIgnored (ignored, chatID, pk) {
    // chatID : String, pk : String
    const ignoredMessage = addMsgID({
        type: "ignored",
        ignored: ignored,
        chatID: chatID,
        from: keyPair.publicKey,
    });
    broadcastToMembers(ignoredMessage, chatID);
    joinedChats.get(chatID).members.forEach((pk2) => {
        resolveSyncIgnored.set(`${chatID}_${pk2}`, (res) => {
            sendChatHistory(chatID, pk2);
            if (res) {
                console.log(`res success`);
                sendAdvertisement(chatID, pk2);
            } else {
                console.log(`res failed`);
            }
        });
    });
    if (!joinedChats.get(chatID).members.includes(pk)) {
        sendToMember(ignoredMessage, pk)
    }
}

async function receivedIgnored (ignored, chatID, pk, resolve) {
    // ignored: Array of Object, chatID: String, pk: stringify(public key of sender)
    console.log(`${ignored}`);
    await store.getItem(chatID).then(async (chatInfo) => {
        if (pk === keyPair.publicKey) { resolve(true); return; }
        console.log(`receiving ignored ${ignored.length} for chatID ${chatID} from ${keyMap.get(pk)}`);

        if (opsArrEqual(chatInfo.metadata.ignored, ignored)) {
            console.log(`same universe naisu`);
            const memberSet = await access.members(chatInfo.metadata.operations, chatInfo.metadata.ignored);
            joinedChats.get(chatID).exMembers.delete(pk);
            if (joinedChats.get(chatID).exMembers.delete(pk) && chatInfo.historyTable.has(pk)) {
                const interval = chatInfo.historyTable.get(pk).pop()
                interval[1] = 0;
                chatInfo.historyTable.get(pk).push(interval);
            }

            await store.setItem("joinedChats", joinedChats);
            if (memberSet.has(pk)) {
                updateMembers(memberSet, chatID);
            }

            if (memberSet.has(keyPair.publicKey)) {
                resolve(true);
            } else {
                resolve(false);
            }

        } else {
            console.log(`different universe from ${keyMap.get(pk)}`);
            if (joinedChats.get(chatID).members.includes(pk)) {
                joinedChats.get(chatID).members.splice(joinedChats.get(chatID).members.indexOf(pk), 1);
            }
            joinedChats.get(chatID).exMembers.add(pk);
            if (!joinedChats.get(chatID).exMembers.has(pk) && chatInfo.historyTable.has(pk)) {
                const interval = chatInfo.historyTable.get(pk).pop()
                const choice = chatInfo.history.at(chatInfo.history.findLastIndex((msg) => msg.type === "selectedIgnored" && msg.from === keyPair.publicKey && msg.op.pk1 === pk));
                interval[1] = choice;
                chatInfo.historyTable.get(pk).push(interval);
            }
            store.setItem("joinedChats", joinedChats);
            updateChatInfo();
            resolve(false);
        }
    });
}

const resolveSyncIgnored = new Map();

async function receivedOperations (ops, chatID, pk) {
    // ops: Array of Object, chatID: String, pk: stringify(public key of sender)
    console.log(`receiving operations for chatID ${chatID} from ${keyMap.get(pk)}`);
    return new Promise(async (resolve) => {
        console.log(`ops acquired lock`);
        if (pk === keyPair.publicKey) { return resolve(true); }

        await store.getItem(chatID).then(async (chatInfo) => {
            var ignoredSet = chatInfo.metadata.ignored;
            chatInfo.metadata.operations = access.verifiedOperations(ops, chatInfo.metadata.operations, chatInfo.metadata.unresolved);
            await store.setItem(chatID, chatInfo);

            const graphInfo = access.hasCycles(chatInfo.metadata.operations);
            console.log(`graph Info ${graphInfo.cycle}`);
            if (graphInfo.cycle) {
                
                if (access.unresolvedCycles(graphInfo.concurrent, chatInfo.metadata.ignored)) {
                    console.log(`cycle detected`);
                    ignoredSet = await getIgnored(graphInfo.concurrent, chatID);
                }

                sendIgnored(ignoredSet, chatID, pk);
                const queuedIgnoredSets = [...peerIgnored].filter((entry) => entry[0].split("_")[0] == chatID);
                console.log([...peerIgnored.keys()]);
                for (const [syncID, queuedIg] of queuedIgnoredSets) {
                    console.log(`${queuedIg.ignored.length}`);
                    await receivedIgnored(queuedIg.ignored, chatID, queuedIg.pk, resolve);
                    joinedChats.get(chatID).peerIgnored.delete(queuedIg.pk);
                    peerIgnored.delete(syncID);
                }
                resolveSyncIgnored.set(`${chatID}_${pk}`, resolve);
                return;
            }
            
            const memberSet = await access.members(chatInfo.metadata.operations, ignoredSet);
            console.log(`valid?`);
            if (memberSet.has(pk)) {
                updateMembers(memberSet, chatID);
            }

            // if (graphInfo.cycle) {
            //     console.log(`set resolve`);
            //     resolveSyncIgnored.set(`${chatID}_${pk}`, resolve);
            //     return;
            // } else {
                return memberSet.has(pk) && memberSet.has(keyPair.publicKey) ? resolve(true) : resolve(false);
            // }
        });
    });
}

async function updateMembers (memberSet, chatID) {
    for (const mem of memberSet) { // populating keyMap
        await getUsername(mem);
    }

    if (memberSet.has(keyPair.publicKey)) {
        updateChatOptions("add", chatID);
        joinedChats.get(chatID).currentMember = true;
        joinedChats.get(chatID).exMembers.delete(keyPair.publicKey);
    }

    // add all the users which are no longer valid to exMembers
    joinedChats.get(chatID).validMembers.forEach(pk => {
        if (!memberSet.has(pk)) {
            joinedChats.get(chatID).exMembers.add(pk)
        }
    });
    joinedChats.get(chatID).validMembers = memberSet;
    joinedChats.get(chatID).members = [...joinedChats.get(chatID).validMembers].filter(pk => !joinedChats.get(chatID).exMembers.has(pk));
    await store.setItem("joinedChats", joinedChats);
    updateChatInfo();
    console.log(`all valid members ${chatID} ${[...joinedChats.get(chatID).validMembers].map(pk => keyMap.get(pk))}`);
    console.log(`current universe members ${chatID} ${joinedChats.get(chatID).members.map(pk => keyMap.get(pk))}`);
    console.log(`current exmembers ${chatID} ${[...joinedChats.get(chatID).exMembers].map(pk => keyMap.get(pk))}`);
}


////////////////////////////
// Peer to Peer Functions //
////////////////////////////

function initPeerConnection() {
    try {
        const connection = new RTCPeerConnection(configuration);
        connection.ondatachannel = receiveChannelCallback;
        connection.onclose = function (event) {
            console.log(`received onclose`);
            closeConnections(connectionNames.get(connection), 0);
        };
        connection.onicecandidate = function (event) {
            console.log("New candidate");
            if (event.candidate) {
                sendToServer({
                    type: "candidate",
                    candidate: event.candidate,
                    name: localUsername,
                    chatID: currentChatID
                });
            }
        };
        connection.oniceconnectionstatechange = function (event) {
            if (connection.iceConnectionState === "failed") {
                connections.delete(connectionNames.get(connection));
                console.log(`Restarting ICE because ${connectionNames.get(connection)} failed`);
                connection.restartIce();
            }
        }
        connection.onconnectionstatechange = function (event) {
            console.log(event);
            if (connection.connectionState === "failed") {
                connections.delete(connectionNames.get(connection));
                console.log(`Restarting ICE because ${connectionNames.get(connection)} failed`);
                connection.restartIce();
            }
        }
        // connection.onnegotiationneeded = function (event) {
        //     console.log("On negotiation needed")
        //     if (connection.connectionState === "failed") {
        //         console.log(JSON.stringify(event));
        //         console.log(`connection name ${connectionNames.get(connection)}`);
        //         connection.createOffer(function (offer) { 
        //             sendToServer({
        //                 to: connectionNames.get(connection),
        //                 type: "offer",
        //                 offer: offer ,
        //                 fromPK: keyPair.publicKey,
        //                 from: localUsername,
        //             });
        //             connection.setLocalDescription(offer);
        //         }, function (error) { 
        //             alert("An error has occurred."); 
        //         }, function () {
        //             console.log("Create Offer failed");
        //         }, {
        //             iceRestart: true
        //         });
        //     }
        // }
        console.log("Local RTCPeerConnection object was created");
        return connection;
    } catch (e) {
        console.error(e);
        return null;
    }
}

function initChannel(channel) {
    channel.onopen = (event) => { onChannelOpen(event); }
    channel.onclose = (event) => { console.log(`Channel ${event.target.label} closed`); }
    channel.onmessage = async (event) => { await receivedMessage(JSON.parse(event.data), event.target) }
}

async function receivedMessage (messageData, channel=null) {
    console.log(`received a message from the channel of type ${messageData.type} from ${keyMap.get(messageData.from)}`);
    if (messageData.chatID !== currentChatID && (messageData.type === "text" || messageData.type === "add" || messageData.type === "remove")
    && document.getElementById(`chatCard${messageData.chatID}`) !== null) {
        document.getElementById(`chatCard${messageData.chatID}`).className = "card card-chat notif";
    }
    switch (messageData.type) {
        case "ack":
            console.log(`ack received ${messageData.id}`);
            acks.delete(messageData.id);
            return;
        case "SIGMA1":
            onSIGMA1(strToArr(messageData.value), channel);
            console.log(`confused ${channel.label}`);
            return;
        case "SIGMA2":
            onSIGMA2.get(channel)(messageData);
            return;
        case "SIGMA3":
            onSIGMA3.get(channel)(messageData);
            return;
        case "ops":
            if (messageData.sigmaAck) { sendOperations(messageData.chatID, messageData.from); }
            receivedOperations(messageData.ops, messageData.chatID, messageData.from).then(async (res) => {
                await sendChatHistory(messageData.chatID, messageData.from);
                if (res) {
                    console.log(`res success`);
                    updateConnectStatus(messageData.from, true);
                    sendAdvertisement(messageData.chatID, messageData.from);
                } else {
                    console.log(`res fail`);
                    updateConnectStatus(messageData.from, false);
                    // closeConnections(messageData.from, messageData.chatID);
                }
            });
            break;
        case "ignored":
            const syncID = `${messageData.chatID}_${messageData.from}`;
            console.log(`${[...resolveSyncIgnored.keys()]}`);
            if (resolveSyncIgnored.has(syncID)) {
                console.log(`ripe ignored`);
                receivedIgnored(messageData.ignored, messageData.chatID, messageData.from, resolveSyncIgnored.get(syncID));
                resolveSyncIgnored.delete(syncID);
            } else if (messageData.from !== keyPair.publicKey) {
                console.log(`premature ignored`);
                peerIgnored.set(syncID, { pk: messageData.from, ignored: messageData.ignored });
                console.log(`${peerIgnored.size} pls ${syncID}`);
                joinedChats.get(messageData.chatID).peerIgnored.set(messageData.from, messageData.ignored);
                store.setItem("joinedChats", joinedChats);
            }
            break;
        case "selectedIgnored":
            await updateChatStore(messageData);
            if (messageData.chatID == currentChatID) {
                elem.updateSelectedMembers(keyMap.get(messageData.from), messageData.op.sig);
                refreshChatWindow(messageData.chatID);
            }
            break;
                
        case "advertisement":
            // if (messageData.online.length === 0) { getOnline(messageData.chatID); } 
            messageData.online.forEach((peer) => connectToPeer(peer));
            break;
        case "history":
            await mergeChatHistory(messageData.chatID, messageData.from, messageData.history);
            break;
        case "remove":
            await receivedOperations([messageData.op], messageData.chatID, messageData.from).then(async (res) => {
                if (res) { 
                    if (messageData.op.pk2 === keyPair.publicKey) {
                        updateChatWindow(messageData);
                        await updateChatStore(messageData);
                        onRemove(messageData);
                    } else {
                        removePeer(messageData); 
                    }
                } else {
                    console.log(`reject`);
                }
            });
            break;
        case "add":
            if (messageData.op.pk2 === keyPair.publicKey) {
                onAdd(messageData.chatID, messageData.chatName, messageData.from, messageData.ignored, messageData);
            } else {
                await receivedOperations([messageData.op], messageData.chatID, messageData.from).then(async (res) => {
                    if (res) { addPeer(messageData); }
                });
            }
            break;
        case "text":
            if (joinedChats.get(messageData.chatID).members.includes(messageData.from)) {
                updateChatWindow(messageData);
                await updateChatStore(messageData);
            }
            break;
        case "close":
            sendChatHistory(messageData.chatID, messageData.from);
            closeConnections(messageData.from, messageData.chatID);
            break;
        default:
            console.log(`Unrecognised message type ${messageData.type}`);
    }
    sendToMember({
        type: "ack",
        id: `${messageData.id}${keyPair.publicKey}`,
        from: keyPair.publicKey
    }, messageData.from, false);
}

async function initSIGMA (channel) {
    // only used for p2p connections
    return new Promise(async (resolve) => {
        const dh = nacl.box.keyPair();

        channel.send(JSON.stringify({
            type: "SIGMA1",
            value: arrToStr(dh.publicKey),
        }));
    
        const res = await new Promise((res) => { onSIGMA2.set(channel, res); });
    
        const localValue = dh.publicKey;
        const peerValue = strToArr(res.value);
        const peerPK = strToArr(res.pk);
        const sessionKey = nacl.box.before(peerValue, dh.secretKey);
        const macKey = nacl.hash(concatArr(setAppIdentifier, sessionKey));
    
        sessionKeys.set(channel, {
            dh: dh,
            session: sessionKey,
            mac: macKey,
        });
    
        const receivedValues = concatArr(localValue, peerValue);
    
        if (nacl.sign.detached.verify(receivedValues, strToArr(res.sig), peerPK) 
        && nacl.verify(strToArr(res.mac), access.hmac512(macKey, peerPK))) {
            if (connections.has(res.pk)) {
                connections.get(res.pk).auth = true;
            }

            sendToMember({
                success: true,
                type: "SIGMA3",
                pk: keyPair.publicKey,
                sig: arrToStr(nacl.sign.detached(concatArr(peerValue, localValue), keyPair.secretKey)),
                mac: arrToStr(access.hmac512(macKey, strToArr(keyPair.publicKey))),
            }, res.pk, false);
            resolve(true);

        } else {
            sendToMember({
                success: false
            }, res.pk, false);
            resolve(false);
        }
    });
}

async function onChannelOpen(event) {
    console.log(`Channel ${event.target.label} opened`);
    const channelLabel = JSON.parse(event.target.label);
    const peerPK = channelLabel.senderPK === keyPair.publicKey ? channelLabel.receiverPK : channelLabel.senderPK;

    if (resolveConnectToPeer.has(peerPK)) {
        if (await initSIGMA(event.target)) {
            for (const chatID of joinedChats.keys()) {
                if (joinedChats.get(chatID).members.includes(peerPK) || joinedChats.get(chatID).exMembers.has(peerPK)) {
                    sendOperations(chatID, peerPK, true);
                }
            }
        } else {
            updateConnectStatus(peerPK, false);
        }
    }
}

function receiveChannelCallback(event) {
    const channelLabel = JSON.parse(event.channel.label);
    console.log(`Received channel ${event.channel.label} from ${channelLabel.senderPK}`);
    const peerConnection = connections.get(channelLabel.senderPK);
    peerConnection.sendChannel = event.channel;
    initChannel(peerConnection.sendChannel);
}

function sendAdvertisement (chatID, pk) {
    // chatID: String, pk: stringify(pk)
    const online = [];
    for (const mem of joinedChats.get(chatID).members) {
        if (connections.has(mem) && mem !== pk) {
            online.push({ peerName: keyMap.get(mem), peerPK: mem });
        }
    }

    if (online.length > 0) {
        console.log(`sending an advertistment of length ${online.length} to ${pk} of ${online}`)
        sendToMember(addMsgID({
            type: "advertisement",
            online: online,
            from: keyPair.publicKey,
            chatID: chatID,
        }), pk);
    }
}

function isPeerConnected (chatID) {
    const connectedpks = new Set(connections.keys());
    console.log(connectedpks);
    return joinedChats.get(chatID).members.findIndex((pk) => {connectedpks.has(pk)}) > -1;
}

async function sendChatHistory (chatID, pk) {
    console.log(`sending chat history to ${pk}`);
    console.log(`is pk string ${typeof pk}`);
    await store.getItem(chatID).then(async (chatInfo) => {
        var peerHistory = [];
        if (!chatInfo.historyTable.has(pk)) {
            chatInfo.historyTable.set(pk, [[chatInfo.history[0].id, 0]]);
            await store.setItem(chatID, chatInfo);
        }
        const intervals = chatInfo.historyTable.get(pk);
        var start, end;
        for (const interval of intervals) {
            start = chatInfo.history.findIndex(msg => { return msg.id === interval[0]; });
            end = chatInfo.history.findIndex(msg => { return msg.id === interval[1]; });
            end = (interval[1] == 0 ? chatInfo.history.length : end) + 1;
            peerHistory = peerHistory.concat(chatInfo.history.slice(start, end));
        }
        
        sendToMember(addMsgID({
            type: "history",
            history: peerHistory,
            chatID: chatID,
            from: keyPair.publicKey
        }), pk);
    });
}

function initChatHistoryTable (chatID, msgID) {
    console.log(`initialised chat history`);
    store.getItem(chatID).then(async (chatInfo) => {
        for (const pk of joinedChats.get(chatID).members) {
            if (!chatInfo.historyTable.has(pk)) {
                chatInfo.historyTable.set(pk, []);
            }
            chatInfo.historyTable.get(pk).push([msgID, 0]);
        }
        await store.setItem(chatID, chatInfo);
    });
} 

var resolveConnectToPeer = new Map();

function connectToPeer (peer) {
    // peer: JSON {peerName: String, peerPK: string}
    return new Promise((resolve) => {
        if (peer.peerName === localUsername || resolveConnectToPeer.has(peer.peerPK)) { resolve(false); return; }
        if (connections.has(peer.peerPK)) { 
            if (connections.get(peer.peerPK).auth) {
                resolve(true); 
            } else {
                resolve(false);
            }
            return;
        }

        resolveConnectToPeer.set(peer.peerPK, resolve);
        keyMap.set(peer.peerPK, peer.peerName);
        store.setItem("keyMap", keyMap);

        sendOffer(peer.peerName, peer.peerPK);
        setTimeout(() => {
            resolve(false);
        }, 10000);
    });
}

function updateConnectStatus (pk, success) {
    console.log(`updating connect status of ${keyMap.get(pk)} to ${success}`);
    if (resolveConnectToPeer.has(pk)) { 
        resolveConnectToPeer.get(pk)(success);
        resolveConnectToPeer.delete(pk);
    }
}

async function addPeer(messageData) {
    const pk = messageData.op.pk2;
    keyMap.set(pk, messageData.username);
    store.setItem("keyMap", keyMap);

    if (!joinedChats.get(messageData.chatID).members.includes(pk)) {
        joinedChats.get(messageData.chatID).members.push(pk);
    }
    if (!joinedChats.get(messageData.chatID).validMembers.has(pk)) {
        joinedChats.get(messageData.chatID).validMembers.add(pk);
    }
    joinedChats.get(messageData.chatID).exMembers.delete(pk);
    store.setItem("joinedChats", joinedChats);

    updateChatInfo();
    updateChatWindow(messageData);
    await store.getItem(messageData.chatID).then((chatInfo) => {
        if (!chatInfo.historyTable.has(pk)) {
            chatInfo.historyTable.set(pk, []);
        }
        chatInfo.historyTable.get(pk).push([messageData.id, 0]);
        chatInfo.history.push(messageData);
        store.setItem(messageData.chatID, chatInfo);
        console.log(`history for ${pk}: ${chatInfo.historyTable.get(pk)}`);
    }).then(() => console.log(`added message data to chat history`));
}

async function removePeer (messageData) {
    const pk = messageData.op.pk2;

    await store.getItem(messageData.chatID).then(async (chatInfo) => {
        if (chatInfo.historyTable.has(pk)) {
            const interval = chatInfo.historyTable.get(pk).pop();
            interval[1] = messageData.id;
            chatInfo.historyTable.get(pk).push(interval);
        }
        chatInfo.history.push(messageData);
        console.log(`history for ${pk}: ${chatInfo.historyTable.get(pk)}`);
        await store.setItem(messageData.chatID, chatInfo);
    }).then(() => console.log(`added removal message data to chat history`));

    if (joinedChats.get(messageData.chatID).members.includes(pk)) {
        joinedChats.get(messageData.chatID).members.splice(joinedChats.get(messageData.chatID).members.indexOf(pk), 1);
    }
    joinedChats.get(messageData.chatID).validMembers.delete(pk);
    
    joinedChats.get(messageData.chatID).exMembers.add(pk);
    await store.setItem("joinedChats", joinedChats);

    updateChatInfo();
    updateChatWindow(messageData);
    closeConnections(pk, messageData.chatID);
}

async function refreshChatWindow (chatID) {
    if (chatID === currentChatID) {
        chatWindow.innerHTML = '<div id="anchor" style="overflow-anchor: auto; height: 1px" ></div>';
        await store.getItem(currentChatID).then(async (chatInfo) => {
            chatInfo.history.forEach(data => {
                updateChatWindow(data);
            });
        });
    }
}

function updateChatWindow (data) {
    // data: JSON
    if (data.chatID === currentChatID) {
        const message = document.createElement('p');
        message.id = data.id;
        message.className = "chat-message";
        switch (data.type) {
            case "create":
                message.innerHTML = `[${formatDate(data.sentTime)}] chat created by ${keyMap.get(data.from)}`;
                break;
            case "text":
                message.innerHTML = `[${formatDate(data.sentTime)}] ${keyMap.get(data.from)}: ${data.message}`;
                break;
            case "add":
                message.innerHTML = `[${formatDate(data.sentTime)}] <span style="color: #169873;">${keyMap.get(data.op.pk1)} added ${keyMap.get(data.op.pk2)}</span>`;
                break;
            case "remove":
                message.innerHTML = `[${formatDate(data.sentTime)}] <span style="color: #fc5c65;">${keyMap.get(data.op.pk1)} removed ${keyMap.get(data.op.pk2)}</span>`;
                break;
            case "selectedIgnored":
                message.innerHTML = `[${formatDate(data.sentTime)}] <span style="color: #5E6472;">${keyMap.get(data.from)} chose to ignore '${keyMap.get(data.op.pk1)} ${data.op.action} ${keyMap.get(data.op.pk2)}</span>'`;
                break;
            default:
                break;
        }
        chatWindow.insertBefore(message, chatWindow.lastElementChild);
    }
}

async function updateChatStore (messageData) {
    await store.getItem(messageData.chatID).then(async (chatInfo) => {
        chatInfo.history.push(messageData);
        await store.setItem(messageData.chatID, chatInfo);
    });
}

function sendToMember (data, pk, requireAck=true) {
    // data: JSON, pk: String
    if (pk === keyPair.publicKey && data.type !== "ack") { return receivedMessage(data); }
    console.log(`sending ${data.type} to ${keyMap.get(pk)}`);
    if (connections.has(pk) && onlineMode) {
        try {
            connections.get(pk).sendChannel.send(JSON.stringify(data));
            if (requireAck && pk !== keyPair.publicKey) { acks.add(`${data.id}${pk}`); }
        } catch (err) {
            console.log(`failed to send ${data.type}`);
            console.error(err.message);
        }
    }
    return;
}

function addMsgID (data) {
    data.sentTime = Date.now();
    if (data.type == "create" || data.type == "add" || data.type == "remove") {
        data.id = data.op.sig;
    } else {
        data.id = arrToStr(nacl.hash(enc.encode(`${keyPair.publicKey}:${data.sentTime}`)));
    }
    return data;
}

function broadcastToMembers (data, chatID = null) {
    chatID = chatID === null ? currentChatID : chatID;
    for (const pk of joinedChats.get(chatID).members) {
        try {
            sendToMember(data, pk);
        } catch {
            continue;
        }
    }
}

function sendChatMessage (messageInput) {
    const data = addMsgID({
        type: "text",
        from: keyPair.publicKey,
        message: messageInput,
        chatID: currentChatID
    });

    broadcastToMembers(data, currentChatID);
}


/////////////////////
// Event Listeners //
/////////////////////

loginInput.addEventListener("keypress", ((event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        loginBtn.click();
    }
}));

// Send Login attempt
loginBtn.addEventListener("click", async function (event) {
    login(loginInput.value);
    loginInput.value = "";
});

async function login (username) {
    console.log(username);
    if (username.length > 0 && isAlphanumeric(username)) {
        
        if (store) {
            await store.config({
                storeName: arrToStr(nacl.hash(enc.encode(username)))
            });
            store.getItem("keyPair").then((kp) => console.log(kp.publicKey));
        } else {
            await initialiseStore(username);
            await store.getItem("keyPair").then((kp) => {
                if (kp) {
                    console.log(`keypair ${JSON.stringify(kp)}`);
                    keyPair = kp;
                } else {
                    keyPair = nacl.sign.keyPair();
                    keyPair.publicKey = arrToStr(keyPair.publicKey);
                    console.log("keyPair generated");
                    store.setItem("keyPair", keyPair);
                    store.setItem("keyMap", keyMap);
                    store.setItem("msgQueue", msgQueue);
                }
            });

            if (!await onSIGMA1(serverValue, connection)) {
                alert("failed to authenticate connection");
                return;
            }
        }
        console.log(`sending login`);
        sendToServer({
            type: "login",
            name: username,
            sig: arrToStr(nacl.sign.detached(enc.encode(username), keyPair.secretKey)),
        });
    }
}

chatNameInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        newChatBtn.click();
    }
});

messageInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        sendMessageBtn.click();
    }
});

addUserInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        addUserBtn.click();
    }
});

sendMessageBtn.addEventListener("click", function () {
    if (messageInput.value.length > 0) {
        sendChatMessage(messageInput.value);
        messageInput.value = "";
    }
})

newChatBtn.addEventListener("click", () => {
    createNewChat();
    elem.closePopup();
    chatNameInput.value = "";
});

logoutBtn.addEventListener("click", logout);

addUserBtn.addEventListener("click", async () => {
    if (currentChatID === 0) { console.alert(`Please select a chat`); return; }
    const username = addUserInput.value;
    try {
        const pk = await getPK(username);
        addUserInput.value = "";
        // as long as you are in some universe
        if (joinedChats.get(currentChatID).validMembers.has(pk)) { alert(`User has already been added`); return; }
        addToChat(username, pk, currentChatID);
    } catch (err) {
        alert(`User does not exist`);
        console.log(err);
    }
});

export function disableChatMods (chatID, conflict=false) {
    if (chatID == currentChatID) {
        document.getElementById('addUserCard').style.display = "none";
        chatBar.style.display = "none";
        chatWindow.style.display = "flex";
        disabledChatBar.style.display = conflict ? "none" : "flex";
        conflictChatBar.style.display = conflict ? "flex" : "none";

        document.getElementById('disputeCard').style.display = conflict || joinedChats.get(currentChatID).toDispute == null ? "none" : "flex";
        document.getElementById('defaultText').style.display = "none";
        document.getElementById('chatBoxHeading').style.display = "flex";

        [...document.getElementsByClassName('removeUserBtn')].map((elem) => {
            elem.disabled = true;
        });
    }
}

export function enableChatMods (chatID) {
    if (chatID == currentChatID) {
        document.getElementById('addUserCard').style.display = "flex";
        chatWindow.style.display = "flex";
        chatBar.style.display = "flex";
        disabledChatBar.style.display = "none";
        conflictChatBar.style.display = "none";
        
        document.getElementById('disputeCard').style.display = "none";
        document.getElementById('defaultText').style.display = "none";
        document.getElementById('chatBoxHeading').style.display = "flex";

        [...document.getElementsByClassName('removeUserBtn')].map((elem) => {
            elem.disabled = false;
        });
    }
}

disputeBtn.addEventListener("click", async () => {
    disputeRemoval(joinedChats.get(currentChatID).toDispute, currentChatID);
    joinedChats.get(currentChatID).toDispute = null;
    updateChatInfo();
});

acceptRemovalBtn.addEventListener("click", async () => {
    console.log(`toDispute cleared`);
    joinedChats.get(currentChatID).toDispute = null;
    updateChatInfo();
});

resetStoreBtn.addEventListener("click", () => {
    console.log(`resetting store...`);
    store.keys().then((keys) => {
        for (const key of keys) {
            if (key !== "keyPair") {
                store.removeItem(key);
            }
        }
    })
})

var resolveGetIgnored = new Map();

async function getIgnored (cycles, chatID) {
    return new Promise(async (resolve) => { 
        resolveGetIgnored.set(chatID, [cycles, resolve]); 

        for (const cycle of cycles) {
            const removeSelfIndex = cycle.findLastIndex((op) => op.action === "remove" && op.pk2 === keyPair.publicKey);
            if (removeSelfIndex > -1) {
                console.log(`automatically resolved ${cycle.at(removeSelfIndex).action} ${keyMap.get(cycle.at(removeSelfIndex).pk2)}`);
                await selectIgnored(cycle.at(removeSelfIndex), chatID);
                continue;
            }
        }

        if (chatID === currentChatID && resolveGetIgnored.has(chatID)) {
            document.getElementById('chatBar').style.display = "none";
            updateChatInfo();
        }
    });
}

export async function selectIgnored(ignoredOp, chatID) {
    await store.getItem(chatID).then(async (chatInfo) => {
        // unwinding chat history
        const ignoredOpIndex = chatInfo.history.findIndex(msg => msg.type == ignoredOp.action && msg.op.sig === ignoredOp.sig);

        if (ignoredOpIndex > -1) {
            console.log(`found ignored op`);
            chatInfo.history.splice(ignoredOpIndex);

            if (chatInfo.historyTable.has(ignoredOp.pk2)) {
                const interval = chatInfo.historyTable.get(ignoredOp.pk2).pop();
                if (ignoredOp.action == "remove") {
                    interval[1] = 0;
                    chatInfo.historyTable.get(ignoredOp.pk2).push(interval);
                }
            }
        }

        // writing to storage
        chatInfo.metadata.ignored.push(ignoredOp);
        removeOp(chatInfo.metadata.operations, ignoredOp);
        await store.setItem(chatID, chatInfo);
        refreshChatWindow(chatID);

        // sending to others
        if (ignoredOp.pk2 !== keyPair.publicKey) {
            const msg = addMsgID({
                type: "selectedIgnored",
                op: ignoredOp,
                chatID: chatID,
                from: keyPair.publicKey,
            });
            broadcastToMembers(msg, chatID);
        }

        resolveGetIgnored.get(chatID)[0].splice(resolveGetIgnored.get(chatID)[0].findIndex((cycle) => access.hasOp(cycle, ignoredOp)), 1);
    
        if (resolveGetIgnored.get(chatID)[0].length == 0) {
            resolveGetIgnored.get(chatID)[1](chatInfo.metadata.ignored);
            resolveGetIgnored.delete(chatID);
            chatBox.className = "chat-panel col-8";
            enableChatMods(chatID);
        }
    });
}

function getChatNames() {
    var chatnames = [];
    for (const chatID of joinedChats.keys()) {
        chatnames.push(joinedChats.get(chatID).chatName);
    }
    return chatnames;
}

function getChatID(chatName) {
    for (const chatID of joinedChats.keys()) {
        if (chatName === joinedChats.get(chatID).chatName) {
            return chatID;
        }
    }
    return -1;
}


export function updateChatInfo () {
    if (currentChatID > 0) {
        document.getElementById('chatTitle').innerHTML = joinedChats.get(currentChatID).chatName;

        memberList.innerHTML = "";
        joinedChats.get(currentChatID).members.forEach((pk) => {
            if (pk === keyPair.publicKey) {
                const card = elem.generateUserCard(pk, keyMap.get(pk), currentChatID);
                card.className = `card self`;
                memberList.insertBefore(card, memberList.firstElementChild);
            } else {
                memberList.appendChild(elem.generateUserCard(pk, keyMap.get(pk), currentChatID));
            }
        });

        if (joinedChats.get(currentChatID).currentMember) {
            enableChatMods(currentChatID);
        } else {
            disableChatMods(currentChatID);
        }

        if (resolveGetIgnored.has(currentChatID)) {
            disableChatMods(currentChatID, true);
            chatBox.className = "chat-panel col-8 conflict";
            conflictCardList.innerHTML = "";
            resolveGetIgnored.get(currentChatID)[0].forEach((cycle) => {
                conflictCardList.appendChild(elem.generateConflictCard(cycle, currentChatID));
                for (const op of cycle) {
                    if (document.getElementById(op.sig) == null) {
                        updateChatWindow(addMsgID({
                            type: op.action,
                            chatID: currentChatID,
                            op: op
                        }));
                    }
                }
            });
        };
    }
}

export async function selectChat(chatID) {
    currentChatID = chatID;

    document.getElementById(`chatCard${chatID}`).className = "card card-chat";
    await navigator.locks.request("history", async () => {
        await refreshChatWindow(currentChatID);
    });
    updateChatInfo();
}

const chatOptions = new Set();

function updateChatOptions (operation, chatID) {
    if (operation === "add" && !chatOptions.has(chatID)) {
        elem.generateChatCard(chatID, joinedChats.get(chatID).chatName);
        chatOptions.add(chatID);
        return;
    }

    if (operation === "remove" && chatOptions.has(chatID)) {
        chatOptions.delete(chatID);
        document.getElementById(`chatCard${chatID}`).remove();
    }
}

function createNewChat () {
    sendToServer({
        type: "createChat",
        chatName: chatNameInput.value,
        from: keyPair.publicKey,
    });
}

function logout () {
    for (const chatID of joinedChats.keys()) {
        joinedChats.get(chatID).members.forEach((pk) => {
            closeConnections(pk, chatID);
        });
    }
    initialiseClient();
    sendToServer({
        type: "leave",
        pk: keyPair.publicKey,
    });
}

connectBtn.addEventListener("click", () => {
    if (onlineMode) { goOffline(); }
    else { connectToServer(); }
});

function goOffline () {
    console.log(`goOffline`);
    onlineMode = false;
    wifiSlash.style.display = "block";
    connection.close();
    for (const pk of connections.keys()) {
        closeConnections(pk, 0);
    }
}


///////////
// UTILS //
///////////

function opsArrEqual (ops1, ops2) {
    if (ops1.length !== ops2.length) { return false; }

    const sigSet = new Set(ops1.map(op => op.sig));
    for (const op of ops2) {
        if (!sigSet.has(op.sig)) {
            return false;
        }
    }
    return true;
}

function removeOp(ops, op) {
    for (let i = 0; i < ops.length; i++) {
        if (ops[i].sig === op.sig) {
            ops.splice(i, 1);
        }
    }
}

function mergeJoinedChats(localChats, receivedChats) {
    console.log(localChats);
    const mergedChats = new Map([...localChats]);
    if (receivedChats.size === 0) { return mergedChats; }
    const localChatIDs = new Set(localChats.keys());
    for (const id of receivedChats.keys()) {
        if (!localChatIDs.has(id)) {
            mergedChats.set(id, {
                chatName: chatName,
                validMembers: new Set([fromPK]),
                members: receivedChats.get(id),
                exMembers: new Set(),
                peerIgnored: new Map(),
                currentMember: false,
                toDispute: null
            });
            receivedChats.get(id);
        } else {
            mergedChats.get(id).currentMember = receivedChats.get(id).currentMember;
        }
    }
    return mergedChats;
}


async function mergeChatHistory (chatID, pk, receivedMsgs) {
    await navigator.locks.request("history", async () => {
        await store.getItem(chatID).then(async (chatInfo) => {
            const localMsgs = chatInfo.history;
            console.log(`local length ${localMsgs.length}`);
            console.log(`received length ${receivedMsgs.length}`);
            var newMessage = false;

            if (receivedMsgs.length > 0) {
                const mergedChatHistory = [...localMsgs];
                const modifiedHistoryTable = new Set();
                var pk2;
                
                const localMsgIDs = new Set(localMsgs.map(msg => msg.id));
                for (const msg of receivedMsgs) {
                    if (!localMsgIDs.has(msg.id)) { // if we don't have this message
                        mergedChatHistory.push(msg);
                        newMessage = true;

                        if (msg.type === "text") { continue; }

                        // rolling forward changes to history table
                        if (msg.op.pk2 !== keyPair.publicKey) {
                            pk2 = msg.op.pk2;
                            if (msg.type === "add") {
                                if (!chatInfo.historyTable.has(pk2)) {
                                    chatInfo.historyTable.set(pk2, []);
                                }
                                modifiedHistoryTable.add(pk2);
                                chatInfo.historyTable.get(pk2).push([msg.id, 0]);

                            } else if (msg.type === "remove") {
                                modifiedHistoryTable.add(pk2);
                                if (!chatInfo.historyTable.has(pk2)) {
                                    chatInfo.historyTable.set(pk2, [[localMsgs[0].id, 0]]);
                                }
                                const interval = chatInfo.historyTable.get(pk2).pop();
                                interval[1] = msg.id;
                                chatInfo.historyTable.get(pk2).push(interval);
                            }
                        }
                    }
                }

                // sorting intervals for each set of intervals
                for (pk of modifiedHistoryTable) {
                    chatInfo.historyTable.get(pk).sort((a, b) => { a[0] - b[0] });
                }

                mergedChatHistory.sort((a, b) => {
                    if (a.sentTime > b.sentTime) { return 1; }
                    if (a.sentTime < b.sentTime) { return -1; }
                    if (a.username > b.username) { return 1; }
                    else { return -1; } // (a[1].username <= b[1].username) but we know it can't be == and from the same timestamp
                });
                chatInfo.history = mergedChatHistory;

                await store.setItem(chatID, chatInfo);
                await refreshChatWindow(chatID);
                if (newMessage && chatID !== currentChatID && document.getElementById(`chatCard${chatID}`) !== null) { 
                    document.getElementById(`chatCard${chatID}`).className = "card card-chat notif";
                }
            }
        });
    });
}

function closeConnections (pk, chatID=0) {
    if (chatID !== 0) {
        for (const id of joinedChats.keys()) {
            if (chatID !== id && joinedChats.get(id).members.includes(pk)) {
                return;
            }
        }
    }
    if (connections.has(pk) && !offerSent.has(pk) && (chatID == 0 || [...acks].findIndex((id) => id.slice(128) === pk) == -1)) {
        connectionNames.delete(connections.get(pk).connection);
        if (connections.get(pk).sendChannel) {
            connections.get(pk).sendChannel.close();
            connections.get(pk).sendChannel = null;
        }
        if (connections.get(pk).connection) {
            connections.get(pk).connection.close();
            connections.get(pk).connection = null;
        }
        connections.delete(pk);
    }
    console.log(`active connections ${[...connections.keys()].map((pk) => keyMap.get(pk))}`);
}

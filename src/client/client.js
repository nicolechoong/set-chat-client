import localforage from "https://unpkg.com/localforage@1.9.0/src/localforage.js";

var loginBtn = document.getElementById('loginBtn');
var sendMessageBtn = document.getElementById('sendMessageBtn');
var addUserBtn = document.getElementById('addUserBtn');
var removeUserBtn = document.getElementById('removeUserBtn');
var disputeBtn = document.getElementById('disputeBtn');
var acceptRemovalBtn = document.getElementById('acceptRemovalBtn');
var resetStoreBtn = document.getElementById('resetStoreBtn');
var chatMessages = document.getElementById('chatMessages');

var loginInput = document.getElementById('loginInput');
var chatNameInput = document.getElementById('chatNameInput');
var ignoredInput = document.getElementById('ignoredInput');
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

// private keypair for the client
var keyPair;

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

var currentChatID = 0;

// map from stringify(pk):string to {connection: RTCPeerConnection, sendChannel: RTCDataChannel}
var connections = new Map();

// (chatID: String, {chatName: String, members: Array of String})
var joinedChats = new Map();

// local cache : localForage instance
var store;

// map from public key : stringify(pk) to username : String
var keyMap = new Map();

// map from public key : stringify(pk) to array of JSON object representing the message data
var msgQueue = new Map();

// caching deps
var hashedOps = new Map();


/////////////////////////
// WebSocket to Server //
/////////////////////////

var connection = new WebSocket('wss://35.178.80.94:3000/');
// var connection = new WebSocket('wss://localhost:3000');

connection.onopen = function () {
    console.log("Connected to server");
};

connection.onerror = function (err) {
    console.log("Error: ", err);
    alert("Please authorise wss://35.178.80.94:3000/ on your device before refreshing! ")
};

function sendToServer(message) {
    console.log(JSON.stringify(message));
    connection.send(JSON.stringify(message));
};

// Handle messages from the server 
connection.onmessage = function (message) {
    console.log("Got message", message.data);
    var data = JSON.parse(message.data);

    switch (data.type) {
        case "login":
            onLogin(data.success, new Map(data.joinedChats), data.username);
            break;
        case "offer":
            onOffer(data.offer, data.from, objToArr(data.fromPK));
            break;
        case "answer":
            onAnswer(data.answer, objToArr(data.fromPK));
            break;
        case "candidate":
            onCandidate(data.candidate, objToArr(data.from));
            break;
        case "connectedUsers":
            onConnectedUsers(data.usernames);
            break;
        case "join":
            onJoin(data.usernames);
            break;
        case "leave":
            onLeave(JSON.stringify(data.from));
            break;
        case "createChat":
            onCreateChat(data.chatID, data.chatName, new Map(JSON.parse(data.validMemberPubKeys)), data.invalidMembers);
            break;
        case "add":
            onAdd(data.chatID, data.chatName, data.from, objToArr(data.fromPK), data.msgID);
            break;
        case "remove":
            onRemove(data.chatID, data.chatName, data.from, objToArr(data.fromPK));
            break;
        case "getUsername":
            onGetUsername(data.username, data.success, data.pk);
            break;
        case "getPK":
            onGetPK(data.username, data.success, objToArr(data.pk));
            break;
        case "getOnline":
            onGetOnline(data.online, data.chatID);
            break;
        default:
            break;
    }
};

// Server approves Login
async function onLogin(success, chats, username) {

    if (success === false) {
        alert("oops...try a different username");
    } else {
        localUsername = username;
        joinedChats = mergeJoinedChats(joinedChats, new Map());
        store.setItem("joinedChats", joinedChats);

        keyMap.set(JSON.stringify(keyPair.publicKey), localUsername);
        store.getItem("keyMap").then((storedKeyMap) => {
            keyMap = storedKeyMap === null ? new Map() : storedKeyMap;
            keyMap.set(JSON.stringify(keyPair.publicKey), localUsername);
            store.setItem("keyMap", keyMap);
        })
        store.getItem("msgQueue").then((storedMsgQueue) => {
            msgQueue = storedMsgQueue === null ? new Map() : storedMsgQueue;
        });
        updateHeading();

        for (const chatID of joinedChats.keys()) {
            updateChatOptions("add", chatID);
            getOnline(chatID);
        }
    }
};

async function initialiseStore(username) {
    // new user: creates new store
    // returning user: will just point to the same instance
    console.log(`init store local user: ${username}`);
    store = localforage.createInstance({
        storeName: username
    });
    store.getItem("joinedChats").then((chats) => {
        if (chats === null) {
            joinedChats = [];
        } else {
            joinedChats = chats;
        }
        store.setItem("joinedChats", joinedChats).then(console.log(`store initialised to ${joinedChats}`));
    });
}

// Sending Offer to Peer
function sendOffer(peerName, peerPK) {
    // peerName: String username, peerPK: Uint8Array

    if (peerName !== null && peerPK !== null) {
        const newConnection = initPeerConnection(peerName);
        console.log(`offer pk key ${JSON.stringify(peerPK)}`);
        connections.set(JSON.stringify(peerPK), { connection: newConnection, sendChannel: null });
        connectionNames.set(newConnection, JSON.stringify(peerPK));
        const peerConnection = connections.get(JSON.stringify(peerPK));

        const channelLabel = {
            senderPK: JSON.stringify(keyPair.publicKey),
            receiverPK: JSON.stringify(peerPK)
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
    }
};

// Receiving Offer + Sending Answer to Peer
async function onOffer(offer, peerName, peerPK) {
    // offer: JSON, peerName: String, peerPK: Uint8Array
    connections.set(JSON.stringify(peerPK), { connection: initPeerConnection(), sendChannel: null });
    const peerConnection = connections.get(JSON.stringify(peerPK));

    keyMap.set(JSON.stringify(peerPK), peerName);
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
    connections.get(JSON.stringify(peerPK)).connection.setRemoteDescription(answer);
}

// Receiving ICE Candidate from Server
function onCandidate(candidate, peerPK) {
    peerPK = JSON.stringify(peerPK);
    if (connections.has(peerPK)) {
        connections.get(peerPK).connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

function onConnectedUsers(usernames) {
    document.getElementById('usernames').innerHTML = `Currently Online: ${usernames.join(", ")}`;

    if (localUsername) {
        const toSend = [...msgQueue.entries()].filter(entry => usernames.has(keyMap.get(entry[0]))).map(entry => entry[0]);
        console.log(`online from queued ${toSend}`);
        for (const pk of toSend) {
            onQueuedOnline(objToArr(pk));
        }
    }
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
    closeConnections(peerPK);
}

async function onCreateChat(chatID, chatName, validMemberPubKeys, invalidMembers) {

    joinedChats.set(chatID, {
        chatName: chatName,
        members: [JSON.stringify(keyPair.publicKey)],
        exMembers: [],
        currentMember: true,
        toDispute: null
    });
    store.setItem("joinedChats", joinedChats);

    for (const name of validMemberPubKeys.keys()) {
        keyMap.set(JSON.stringify(validMemberPubKeys.get(name)), name);
    }
    store.setItem("keyMap", keyMap);

    if (invalidMembers.length > 0) {
        alert(`The following users do not exist ${invalidMembers}`);
    }

    const createOp = await generateOp("create", chatID);
    const operations = [createOp];

    store.setItem(chatID, {
        metadata: {
            chatName: chatName,
            operations: operations,
            ignored: []
        },
        history: [],
        historyTable: new Map(),
    }).then(() => {
        addToChat(validMemberPubKeys, chatID);
    });

    updateChatOptions("add", chatID);
    updateHeading();
}

// When being added to a new chat
function onAdd(chatID, chatName, from, fromPK, msgID) {
    // chatID: String, chatName: String, from: String, fromPK: Uint8Array, msgID: 

    // we want to move this actual joining to after syncing with someone from the chat
    console.log(`you've been added to chat ${chatName} by ${from}`);

    joinedChats.set(chatID, {
        chatName: chatName,
        members: [JSON.stringify(fromPK)],
        exMembers: [],
        currentMember: false,
        toDispute: null
    });
    store.setItem("joinedChats", joinedChats);

    store.setItem(chatID, {
        metadata: {
            chatName: chatName,
            operations: [],
            ignored: []
        },
        history: [],
        historyTable: new Map(),
    }).then(async () => {
        initChatHistoryTable(chatID, msgID);
        if (connections.has(JSON.stringify(fromPK))) {
            sendOperations(chatID, JSON.stringify(fromPK));
        } else {
            if (!(await connectToPeer({ peerName: from, peerPK: fromPK }))) {
                if (!getOnline(chatID)) {
                    console.log(`no one is online :(`);

                }
            }
        }
    });
}

async function addToChat(validMemberPubKeys, chatID) {
    // members is the list of members pubkey: object
    store.getItem(chatID).then(async (chatInfo) => {
        var pk;
        for (const name of validMemberPubKeys.keys()) {
            pk = objToArr(validMemberPubKeys.get(name));
            console.log(`we are now adding ${name} who has pk ${pk} and the ops are ${chatInfo.metadata.operations}`);
            const op = await generateOp("add", chatID, pk, chatInfo.metadata.operations);
            chatInfo.metadata.operations.push(op);

            const addMessage = {
                type: "add",
                op: op,
                from: keyPair.publicKey,
                username: name,
                chatID: chatID,
                chatName: chatInfo.metadata.chatName
            };

            joinedChats.get(chatID).members.push(JSON.stringify(pk));
            await store.setItem("joinedChats", joinedChats);
            await store.setItem(chatID, chatInfo).then(console.log(`${[...validMemberPubKeys.keys()]} have been added to ${chatID}`));
            const msgID = broadcastToMembers(addMessage, chatID);
            sendToServer({
                to: pk,
                type: "add",
                from: localUsername,
                fromPK: keyPair.publicKey,
                chatID: chatID,
                chatName: chatInfo.metadata.chatName,
                msgID: msgID,
            });
            console.log(`added ${name}`);
        }
    });
}

function onRemove(chatID, chatName, from, fromPK) {
    // chatID : string, chatName : string, from : string, fromPK : Uint8Array
    var chatInfo = joinedChats.get(chatID);
    chatInfo.currentMember = false;
    if (chatInfo.toDispute === null && chatInfo.members.includes(JSON.stringify(fromPK))) {
        chatInfo.toDispute = { peerName: from, peerPK: fromPK };
    }
    if (chatInfo.members.includes(JSON.stringify(keyPair.publicKey))) {
        chatInfo.members.splice(chatInfo.members.indexOf(JSON.stringify(keyPair.publicKey)), 1);
    }
    if (!chatInfo.exMembers.includes(JSON.stringify(fromPK))) {
        chatInfo.exMembers.push(JSON.stringify(fromPK));
    }
    console.log(`you've been removed from chat ${chatName} by ${fromPK}`);
    store.setItem("joinedChats", joinedChats);
    for (const pk of chatInfo.members) {
        closeConnections(pk);
    }

    updateHeading();
}

async function removeFromChat(validMemberPubKeys, chatID) {
    // validMemberPubKeys : map of string username to object public key, chatID : string
    store.getItem(chatID).then(async (chatInfo) => {
        var pk;
        for (const name of validMemberPubKeys.keys()) {
            pk = objToArr(validMemberPubKeys.get(name));
            console.log(`we are now removing ${name} and the ops are ${chatInfo.metadata.operations.map(op => op.action)}`);
            const op = await generateOp("remove", chatID, pk, chatInfo.metadata.operations);
            chatInfo.metadata.operations.push(op);
            await store.setItem(chatID, chatInfo).then(console.log(`${[...validMemberPubKeys.keys()]} has been removed from ${chatID}`));

            const removeMessage = {
                type: "remove",
                op: op,
                username: name,
                from: keyPair.publicKey,
                chatID: chatID
            };
            broadcastToMembers(removeMessage, chatID);
            sendToServer({
                to: pk,
                type: "remove",
                from: localUsername,
                fromPK: keyPair.publicKey,
                chatID: chatID,
                chatName: chatInfo.metadata.chatName
            });
            console.log(`removed ${name}`);
        }
    });
}

async function disputeRemoval(peer, chatID) {
    store.getItem(chatID).then(async (chatInfo) => {
        console.log(`we are now disputing ${peer.peerName} and the ops are ${chatInfo.metadata.operations.slice(0, -1)}`);
        const op = await generateOp("remove", chatID, peer.peerPK, chatInfo.metadata.operations.slice(0, -1));
        chatInfo.metadata.operations.push(op);
        await store.setItem(chatID, chatInfo);

        sendToServer({
            to: peer.peerPK,
            type: "remove",
            from: localUsername,
            fromPK: keyPair.publicKey,
            chatID: chatID,
            chatName: chatInfo.metadata.chatName,
        });
        // note that we aren't sending the remove message itself...

        for (const mem of joinedChats.get(chatID).members) {
            connectToPeer({ peerName: await getUsername(mem), peerPK: objToArr(JSON.parse(mem)) });
        }


    });
}

var resolveGetUsername = new Map();
var rejectGetUsername = new Map();

function onGetUsername(name, success, pk) {
    // name: String, success: boolean, pk: string
    if (success) {
        console.log(`Received username of ${pk}, ${name}`);
        keyMap.set(pk, name);
        store.setItem("keyMap", keyMap);
        console.log(`resolveGetUsername keys ${[...resolveGetUsername.keys()]}`);
        resolveGetUsername.get(pk)(name);
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
        console.log(`Requesting for username of ${pk}`);
        sendToServer({
            type: "getUsername",
            pk: pk
        });
    });
}

function onGetPK(name, success, pk) {
    // name: String, success: boolean, pk: Uint8Array
    if (success) {
        console.log(`Received pk of ${name}, ${pk}`);
        keyMap.set(JSON.stringify(pk), name);
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
    for (const peer of online) {
        peer.peerPK = objToArr(peer.peerPK);
        if (await connectToPeer(peer)) {
            console.log(`Successfully connected to ${peer.peerName}`);
            sendOperations(chatID, JSON.stringify(peer.peerPK));
            resolveGetOnline.get(true); // doesn't mean that it synced
        }
    }
    resolveGetOnline.delete(chatID);
}

var resolveGetOnline = new Map();

function getOnline(chatID) {
    return new Promise((resolve) => {
        resolveGetOnline.set(chatID, resolve);
        sendToServer({
            type: "getOnline",
            pk: keyPair.publicKey,
            chatID: chatID
        });
    });
}

async function onQueuedOnline(pk) {
    // pk: Uint8Array
    if (await connectToPeer(pk)) {
        const queue = msgQueue.get(JSON.stringify(pk));
        while (queue.length > 0) {
            sendToMember(queue.shift(), JSON.stringify(pk));
        }
        msgQueue.delete(JSON.stringify(pk)); // honestly so fucking crude
    }
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
                resolve(objToArr(pk));
                return;
            }
        }
        resolveGetPK.set(username, resolve);
        rejectGetPK.set(username, reject);
        console.log(`Requesting for pk of ${username}`);
        sendToServer({
            type: "getPK",
            username: username
        });
    });
}

function getDeps(operations) {
    // operations : Array of Object
    var deps = [];
    for (const op of operations) {
        const hashedOp = hashOp(op);
        if (op.action === "create" || (op.action !== "create" && !op.deps.includes(hashedOp))) {
            deps.push(hashedOp);
        }
    }
    return deps;
}

function concatOp(op) {
    return op.action === "create" ? `${op.action}${op.pk}${op.nonce}` : `${op.action}${op.pk1}${op.pk2}${op.deps}`;
}

async function generateOp(action, chatID, pk2 = null, ops = []) {
    // action: String, chatID: String, pk2: Uint8Array, ops: Array of Object

    return new Promise(function (resolve) {
        var op;
        if (action === "create") {
            op = {
                action: 'create',
                pk: keyPair.publicKey,
                nonce: nacl.randomBytes(64),
            };
        } else if (action === "add" || action === "remove") {
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

async function sendOperations(chatID, pk) {
    // chatID : String, pk : String
    console.log(`sending operations to ${keyMap.get(pk)}`);
    store.getItem(chatID).then((chatInfo) => {
        sendToMember({
            type: "ops",
            ops: chatInfo.metadata.operations,
            chatID: chatID,
            from: keyPair.publicKey,
        }, pk);
    });
}

async function sendIgnored(ignored, chatID, pk) {
    // chatID : String, pk : String
    console.log(`sending ignored to pk ${pk} ${keyMap.get(pk)}`);
    sendToMember({
        type: "ignored",
        ignored: ignored,
        chatID: chatID,
        from: keyPair.publicKey,
    }, pk);
}

const peerIgnored = new Map();

async function receivedIgnored (ignored, chatID, pk) {
    // ops: Array of Object, chatID: String, pk: stringify(public key of sender)
    console.log(`receiving ignored ${ignored.length} for chatID ${chatID}`);
    return new Promise((resolve) => {
        store.getItem(chatID).then(async (chatInfo) => {
            if (hasCycles(chatInfo.metadata.ops, authority(chatInfo.metadata.ops)).cycle) {
                peerIgnored.set(`${chatID}:${pk}`, ignored);
                resolve(false);
                return;
            }

            if (!opsArrEqual(chatInfo.metadata.ignored, ignored)) {
                console.log(`different universe from ${keyMap.get(pk)}`);
                joinedChats.get(chatID).exMembers.push(pk);
                store.setItem("joinedChats", joinedChats);
                updateHeading();
                return resolve(false);
            }
            resolve(true);
        });
    });
}

// TODO: make it so that we don't add the removal/remove the removal before generating ops
async function receivedOperations (ops, chatID, pk) {
    // ops: Array of Object, chatID: String, pk: stringify(public key of sender)
    console.log(`receiving operations for chatID ${chatID}`);
    return new Promise((resolve) => {
        if (pk === JSON.stringify(keyPair.publicKey)) { resolve(true); return; }
        store.getItem(chatID).then(async (chatInfo) => {
            ops = unionOps(chatInfo.metadata.operations, ops);

            if (verifyOperations(ops)) {
                const authorityGraph = authority(ops);

                const graphInfo = hasCycles(ops, authorityGraph);
                if (graphInfo.cycle) {
                    const ignoredOp = await getIgnored(chatID, graphInfo.concurrent);
                    chatInfo.metadata.ignored.push(ignoredOp);
                    removeOp(ops, ignoredOp);
                    console.log(`ignored op is ${ignoredOp.action} ${keyMap.get(JSON.stringify(ignoredOp.pk2))}`);
                    await store.setItem(chatID, chatInfo);

                    sendIgnored(chatInfo.metadata.ignored, chatID, pk);
                    if (peerIgnored.has(`${chatID}:${pk}`)) {
                        receivedIgnored(peerIgnored.get(`${chatID}:${pk}`));
                        peerIgnored.delete(`${chatID}:${pk}`);
                    }
                    return;
                }

                const memberSet = await members(ops, chatInfo.metadata.ignored);
                if (memberSet.has(pk)) {
                    for (const mem of memberSet) { // populating keyMap
                        await getUsername(mem);
                    }
                    if (memberSet.has(JSON.stringify(keyPair.publicKey))) {
                        joinedChats.get(chatID).currentMember = true;
                        updateChatOptions("add", chatID);
                    } else {
                        joinedChats.get(chatID).currentMember = false;
                    }
            
                    joinedChats.get(chatID).exMembers = joinedChats.get(chatID).exMembers.concat(joinedChats.get(chatID).members).filter(pk => { return !memberSet.has(pk) });
                    joinedChats.get(chatID).members = [...memberSet];
                    store.setItem("joinedChats", joinedChats);
                    chatInfo.metadata.operations = ops;
                    store.setItem(chatID, chatInfo);
                    updateHeading();
                    resolve(true);
                    console.log(`verified true is member ${memberSet.has(pk)}`);
                    console.log(`joinedChats ${joinedChats.get(chatID).members.map(pk => keyMap.get(pk))}`)
                }
            }
            resolve(false);
        })
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
    const hashedOps = ops.map((op) => JSON.stringify(hashOp(op)));

    for (const op of otherOps) {
        // valid signature
        if (!nacl.sign.detached.verify(enc.encode(concatOp(op)), op.sig, op.pk1)) { console.log("op verification failed: key verif failed"); return false; }

        // non-empty deps and all hashes in deps resolve to an operation in o
        for (const dep of op.deps) {
            if (!hashedOps.includes(JSON.stringify(dep))) { console.log("op verification failed: missing dep"); return false; } // as we are transmitting the whole set
        }
    }

    return true;
}

function hashOp (op) {
    return nacl.hash(enc.encode(concatOp(op)));
}

function getOpFromHash(ops, hashedOp) {
    if (hashedOps.has(JSON.stringify(hashedOp))) { return hashedOps.get(JSON.stringify(hashedOp)); }
    for (const op of ops) {
        if (arrEqual(hashedOp, hashOp(op))) {
            hashedOps.set(JSON.stringify(hashedOp), op);
            return op;
        }
    }
}

// takes in set of ops
function precedes (ops, op1, op2) {
    if (!hasOp(ops, op2) || !hasOp(ops, op1)) { return false; } // TODO
    const toVisit = [op2];
    const target = hashOp(op1);
    var curOp, dep;
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
    if (hasOp(ops, op1) && hasOp(ops, op2) && !arrEqual(op1.sig, op2.sig) && !precedes(ops, op1, op2) && !precedes(ops, op2, op1)) { return true; }
    return false;
}

function printEdge (op1, op2 = null) {
    var output = "";
    if (op1.action === "create") {
        output = `op1 ${keyMap.get(JSON.stringify(op1.pk))} ${op1.action} ${JSON.stringify(op1.sig)} `;
    } else {
        output = `op1 ${keyMap.get(JSON.stringify(op1.pk1))} ${op1.action} ${keyMap.get(JSON.stringify(op1.pk2))} ${JSON.stringify(op1.sig)} `;
    }
    if (op2) {
        if (op2.action === "mem") {
            output = `-> ${output} mem ${JSON.stringify(op2.member)}`;
        } else {
            output = `-> ${output} op2 ${keyMap.get(JSON.stringify(op2.pk1))} ${op2.action} ${keyMap.get(JSON.stringify(op2.pk2))}`;
        }
    }
    console.log(output);
}

function authority (ops) {
    const edges = [];
    var pk;
    // convert pk into strings to perform comparisons
    for (const op1 of ops) {
        for (const op2 of ops) {
            if (op2.action === "create") { continue; }
            if (op2.action === "remove" && op1.action === "create") {
                console.log(`very weird create ${JSON.stringify(op1.pk)} remove ${JSON.stringify(op2.pk1)}`);
            }
            if ((((op1.action === "create" && arrEqual(op1.pk, op2.pk1)) || (op1.action === "add" && arrEqual(op1.pk2, op2.pk1))) && precedes(ops, op1, op2))
                || ((op1.action === "remove" && arrEqual(op1.pk2, op2.pk1)) && (precedes(ops, op1, op2) || concurrent(ops, op1, op2)))) {
                edges.push([op1, op2]);
                printEdge(op1, op2);
            }
        }

        pk = op1.action == "create" ? op1.pk : op1.pk2;
        edges.push([op1, { "member": pk, "sig": pk, "action": "mem" }]);
    }
    return edges;
}

function findCycle (fromOp, visited, stack, cycle) {
    // assume start is create
    const cur = stack.at(-1);
    for (const next of fromOp.get(JSON.stringify(cur.sig))) {
        if (visited.get(JSON.stringify(next.sig)) === "IN STACK") {
            cycle.push(...stack.slice(stack.findIndex((op) => arrEqual(op.sig, next.sig))));
        } else if (visited.get(JSON.stringify(next.sig)) === "NOT VISITED") {
            stack.push(next);
            visited.set(JSON.stringify(next.sig), "IN STACK");
            findCycle(fromOp, visited, stack, cycle);
        }
    }
    visited.set(JSON.stringify(cur.sig), "DONE");
    stack.pop();
}

function hasCycles (ops, edges) {
    const start = ops.filter(op => op.action === "create")[0]; // verifyOps means that there's only one
    const seen = new Set([JSON.stringify(start.sig)]);
    const fromOp = new Map();
    const queue = [start];
    var cur;

    for (const edge of edges) {
        if (!fromOp.has(JSON.stringify(edge[0].sig))) {
            fromOp.set(JSON.stringify(edge[0].sig), []);
        }
        if (edge[1].action !== "mem") {
            fromOp.get(JSON.stringify(edge[0].sig)).push(edge[1]);
        }
    }

    while (queue.length > 0) {
        cur = queue.shift();
        for (const next of fromOp.get(JSON.stringify(cur.sig))) {
            if (seen.has(JSON.stringify(next.sig))) { // cycle detected
                console.log(`cycle found`);
                var conc = [];
                findCycle(fromOp, new Map(ops.map((op) => [JSON.stringify(op.sig), "NOT VISITED"])), [cur], conc);
                
                const toOp = new Map(conc.map((op) => [JSON.stringify(op.sig), 0]));
                for (const edge of edges) {
                    if (hasOp(conc, edge[1])) {
                        toOp.set(JSON.stringify(edge[1].sig), toOp.get(JSON.stringify(edge[1].sig))+1);
                    }
                }
                conc.filter((op) => toOp.get(JSON.stringify(op.sig)) >= 2);
                // conc.forEach((op) => {console.log(`${keyMap.get(JSON.stringify(op.pk1))} ${op.action} ${keyMap.get(JSON.stringify(op.pk2))}`)});
                return { cycle: true, concurrent: conc };
            }

            queue.push(next);
            seen.add(JSON.stringify(next.sig));
        }
    }
    return { cycle: false };
}

function valid (ops, ignored, op, authorityGraph) {
    if (op.action === "create") { return true; }
    if (op.action !== "mem" && hasOp(ignored, op)) { console.log(`false because has ignored op ${op.action} ${keyMap.get(JSON.stringify(op.pk2))}`); return false; }

    // all the valid operations before op2
    const inSet = authorityGraph.filter((edge) => {
        return arrEqual(op.sig, edge[1].sig) && valid(ops, ignored, edge[0], authorityGraph);
    }).map(edge => edge[0]);
    // console.log(`inSet for op ${keyMap.get(JSON.stringify(op.pk1))} ${op.action} ${keyMap.get(JSON.stringify(op.pk2))} has length ${inSet.length}`);
    // inSet.forEach(op1 => `inSet for op ${keyMap.get(JSON.stringify(op.pk1))} ${op.action} ${keyMap.get(JSON.stringify(op.pk2))} issss ${keyMap.get(JSON.stringify(op1.pk1))} ${op1.action} ${keyMap.get(JSON.stringify(op1.pk2))}`);
    const removeIn = inSet.filter(r => (r.action === "remove"));

    // ADD COMMENTS
    for (const opA of inSet) {
        if (opA.action === "create" || opA.action === "add") {
            if (removeIn.filter(opR => precedes(ops, opA, opR)).length === 0) {
                return true;
            }
        }
    }
    console.log(`false because removed?`);
    return false;
}

async function members (ops, ignored) {
    const pks = new Set();
    const authorityGraph = authority(ops);
    var pk;
    for (const op of ops) {
        pk = op.action === "create" ? op.pk : op.pk2;
        if (valid(ops, ignored, { "member": pk, "sig": pk, "action": "mem" }, authorityGraph)) {
            pks.add(JSON.stringify(pk));
        }
    }
    console.log(`calculated member set ${[...pks]}      number of members ${pks.size}}`);
    return pks;
}


////////////////////////////
// Peer to Peer Functions //
////////////////////////////

function joinChat(chatID) {
    if (currentChatID !== chatID) {
        currentChatID = chatID;
        for (peerPK of joinedChats.get(chatID).members) {
            if (peerPK !== JSON.stringify(keyPair.publicKey)) {
                // Insert Key Exchange Protocol
                console.log(`peerPK is ${peerPK}`);
                sendOffer(peerName, strToArr(peerPK));
            }
        }
    }
}

function initPeerConnection() {
    try {
        const connection = new RTCPeerConnection(configuration);
        connection.ondatachannel = receiveChannelCallback;
        connection.onclose = function (event) {
            closeConnections(connectionNames.get(connection));
        };
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
                connections.delete(JSON.stringify(connectionNames.get(connection)));
                console.log(`Restarting ICE because ${connectionNames.get(connection)} failed`);
                connection.restartIce();
            }
        }
        connection.onconnectionstatechange = function (event) {
            console.log(event);
            if (connection.connectionState === "failed") {
                connections.delete(JSON.stringify(connectionNames.get(connection)));
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
    channel.onmessage = (event) => { receivedMessage(JSON.parse(event.data)) }
}

function receivedMessage(messageData) {
    console.log(`received a message from the channel of type ${messageData.type}`);
    switch (messageData.type) {
        case "ops":
            messageData.ops.forEach(op => unpackOp(op));
            receivedOperations(messageData.ops, messageData.chatID, JSON.stringify(messageData.from)).then(async (res) => {
                if (res) {
                    sendAdvertisement(messageData.chatID, JSON.stringify(messageData.from));
                    sendChatHistory(messageData.chatID, JSON.stringify(messageData.from));
                } else {
                    closeConnections(JSON.stringify(messageData.from));
                }
            });
            break;
        case "ignored":
            messageData.ignored.forEach(op => unpackOp(op));
            receivedIgnored(messageData.ignored, messageData.chatID, JSON.stringify(messageData.from)).then(async (res) => {
                if (res) {
                    sendAdvertisement(messageData.chatID, JSON.stringify(messageData.from));
                    sendChatHistory(messageData.chatID, JSON.stringify(messageData.from));
                } else {
                    closeConnections(JSON.stringify(messageData.from));
                }
            });
            break;
        case "advertisement":
            messageData.online.forEach((peer) => connectToPeer(peer));
            break;
        case "history":
            store.getItem(messageData.chatID).then((chatInfo) => {
                console.log(`received history is ${JSON.stringify(messageData.history)}`);
                chatInfo.history = mergeChatHistory(chatInfo.history, messageData.history);
                if (messageData.chatID === currentChatID) {
                    chatMessages.innerHTML = "";
                    store.getItem(currentChatID).then(async (chatInfo) => {
                        for (const msg of chatInfo.history) {
                            await updateChatWindow(msg);
                        }
                    });
                }
                store.setItem(messageData.chatID, chatInfo);
            });
            break;
        case "remove":
            unpackOp(messageData.op);
            receivedOperations([messageData.op], messageData.chatID, JSON.stringify(messageData.from)).then((res) => {
                if (res) { removePeer(messageData); }
            });
            break;
        case "add":
            unpackOp(messageData.op);
            if (arrEqual(messageData.op.pk2, keyPair.publicKey)) {
                onAdd(messageData.chatID, messageData.chatName, keyMap.get(JSON.stringify(messageData.from)), objToArray(messageData.from), msgID);
            } else {
                receivedOperations([messageData.op], messageData.chatID, JSON.stringify(messageData.from)).then((res) => {
                    if (res) { addPeer(messageData); }
                });
            }
            break;
        case "text":
            if (joinedChats.get(messageData.chatID).members.includes(JSON.stringify(messageData.from))) {
                updateChatWindow(messageData);
                updateChatStore(messageData);
            }
            break;
        default:
            console.log(`Unrecognised message type ${messageData.type}`);
    }
}

function onChannelOpen(event) {
    console.log(`Channel ${event.target.label} opened`);
    const channelLabel = JSON.parse(event.target.label);
    const peerPK = channelLabel.senderPK === JSON.stringify(keyPair.publicKey) ? channelLabel.receiverPK : channelLabel.senderPK;

    if (resolveConnectToPeer.has(peerPK)) {
        resolveConnectToPeer.get(peerPK)(true);
        resolveConnectToPeer.delete(peerPK);
    }

    for (const chatID of joinedChats.keys()) {
        if (joinedChats.get(chatID).members.includes(peerPK) || joinedChats.get(chatID).exMembers.includes(peerPK)) {
            sendOperations(chatID, peerPK);
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

function sendAdvertisement(chatID, pk) {
    // chatID: String, pk: stringify(pk)
    const online = [];
    for (const mem of joinedChats.get(chatID).members) {
        if (connections.has(mem) && mem !== pk) {
            online.push({ peerName: keyMap.get(mem), peerPK: objToArr(JSON.parse(mem)) });
        }
    }

    if (online.length > 0) {
        console.log(`sending an advertistment to ${pk} of ${JSON.stringify(online)}`)
        sendToMember({
            type: "advertisement",
            online: online
        }, pk);
    }
}

async function sendChatHistory(chatID, pk) {
    console.log(`sending chat history to ${pk}`);
    store.getItem(chatID).then((chatInfo) => {
        var peerHistory = [];

        if (chatInfo.historyTable.has(pk)) {
            const intervals = chatInfo.historyTable.get(pk);
            var start, end;
            for (const interval of intervals) {
                start = chatInfo.history.findIndex(msg => { return msg.id === interval[0]; });
                end = chatInfo.history.findIndex(msg => { return msg.id === interval[1]; });
                end = end < 0 ? chatInfo.history.length : end + 1;
                peerHistory = peerHistory.concat(chatInfo.history.slice(start, end));
            }
        }

        sendToMember({
            type: "history",
            history: peerHistory,
            chatID: chatID
        }, pk);
    });
}

function initChatHistoryTable(chatID, msgID) {
    console.log(`initialised chat history`);
    store.getItem(chatID).then((chatInfo) => {
        for (const pk of joinedChats.get(chatID).members) {
            if (!chatInfo.historyTable.has(pk)) {
                chatInfo.historyTable.set(pk, []);
            }
            chatInfo.historyTable.get(pk).push([msgID, 0]);
        }
        store.setItem(chatID, chatInfo);
    });
}

var resolveConnectToPeer = new Map();

function connectToPeer(peer) {
    // peer: JSON {peerName: String, peerPK: Uint8Array}
    return new Promise((resolve) => {
        if (peer.peerName === localUsername) { resolve(false); return; }
        if (connections.has(JSON.stringify(peer.peerPK))) { resolve(true); return; }

        resolveConnectToPeer.set(JSON.stringify(peer.peerPK), resolve);
        console.log(`adding peer ${peer.peerName} to the keyMap ${JSON.stringify(peer.peerPK)}`)
        keyMap.set(JSON.stringify(peer.peerPK), peer.peerName);
        store.setItem("keyMap", keyMap);
        sendOffer(peer.peerName, peer.peerPK);
        setTimeout(() => {
            resolve(false);
        }, 5000);
    });
}

async function addPeer(messageData) {
    const pk = JSON.stringify(messageData.op.pk2);
    keyMap.set(pk, messageData.username);
    store.setItem("keyMap", keyMap);

    if (!joinedChats.get(messageData.chatID).members.includes(pk)) {
        joinedChats.get(messageData.chatID).members.push(pk);
        joinedChats.get(messageData.chatID).members.sort();
    }
    if (joinedChats.get(messageData.chatID).exMembers.includes(pk)) {
        joinedChats.get(messageData.chatID).exMembers.splice(joinedChats.get(messageData.chatID).members.indexOf(pk), 1);
    }
    store.setItem("joinedChats", joinedChats);

    updateHeading();
    updateChatWindow(messageData);
    await store.getItem(messageData.chatID).then((chatInfo) => {
        if (!chatInfo.historyTable.has(pk)) {
            chatInfo.historyTable.set(pk, []);
        }
        chatInfo.historyTable.get(pk).push([messageData.id, 0]);
        chatInfo.history.push(messageData);
        store.setItem(messageData.chatID, chatInfo);
    }).then(() => console.log(`added message data to chat history`));
}

async function removePeer(messageData) {
    const pk = JSON.stringify(messageData.op.pk2);

    await store.getItem(messageData.chatID).then((chatInfo) => {
        if (chatInfo.historyTable.has(pk)) {
            const interval = chatInfo.historyTable.get(pk).pop();
            interval[1] = messageData.id;
            chatInfo.historyTable.get(pk).push(interval);
        }
        chatInfo.history.push(messageData);
        store.setItem(messageData.chatID, chatInfo);
    });

    if (joinedChats.get(messageData.chatID).members.includes(pk)) {
        joinedChats.get(messageData.chatID).members.splice(joinedChats.get(messageData.chatID).members.indexOf(pk), 1);
    }
    if (!joinedChats.get(messageData.chatID).exMembers.includes(pk)) {
        joinedChats.get(messageData.chatID).exMembers.push(pk);
    }
    store.setItem("joinedChats", joinedChats);

    updateHeading();
    updateChatWindow(messageData);

    if (pk === JSON.stringify(keyPair.publicKey)) {
        return onRemove(messageData.chatID, joinedChats.get(messageData.chatID).chatName, keyMap.get(JSON.stringify(messageData.from)), objToArr(messageData.from));
    } else {
        for (const id of joinedChats.keys()) {
            if (messageData.chatID !== id && joinedChats.get(id).members.includes(pk)) {
                return;
            }
        }
        closeConnections(pk);
    }
}

async function updateChatWindow(data) {
    // data: JSON
    if (data.chatID === currentChatID) {
        var message;
        switch (data.type) {
            case "text":
                message = `${keyMap.get(JSON.stringify(data.from))}: ${data.message}`;
                break;
            case "add":
                message = `${keyMap.get(JSON.stringify(data.op.pk1))} added ${keyMap.get(JSON.stringify(data.op.pk2))}`;
                break;
            case "remove":
                message = `${keyMap.get(JSON.stringify(data.op.pk1))} removed ${keyMap.get(JSON.stringify(data.op.pk2))}`;
                break;
            default:
                message = "";
                break;
        }
        const msg = `${chatMessages.innerHTML}<br />[${formatDate(data.sentTime)}] ${message}`;
        chatMessages.innerHTML = msg;
    }
}

async function updateChatStore(messageData) {
    store.getItem(messageData.chatID).then((chatInfo) => {
        chatInfo.history.push(messageData);
        store.setItem(messageData.chatID, chatInfo);
    }).then(() => {
        console.log("updated chat store");
    });
}

function sendToMember(data, pk) {
    // data: JSON, pk: String
    if (pk === JSON.stringify(keyPair.publicKey)) { return receivedMessage(data); }
    console.log(`sending ${JSON.stringify(data.type)}   to ${keyMap.get(pk)}`);
    if (connections.has(pk)) {
        connections.get(pk).sendChannel.send(JSON.stringify(data));
    }
    return;
}

function broadcastToMembers(data, chatID = null) {
    data.sentTime = Date.now();
    data.id = JSON.stringify(nacl.hash(enc.encode(`${localUsername}:${data.sentTime}`)));
    chatID = chatID === null ? currentChatID : chatID;
    console.log(`username broadcast ${joinedChats.get(chatID).members}`);
    for (const pk of joinedChats.get(chatID).members) {
        try {
            sendToMember(data, pk);
        } catch {
            continue;
        }
    }
    return data.id;
}

function sendChatMessage(messageInput) {
    const data = {
        type: "text",
        from: keyPair.publicKey,
        message: messageInput,
        chatID: currentChatID
    };

    broadcastToMembers(data);
}


/////////////////////
// Event Listeners //
/////////////////////

// Send Login attempt
loginBtn.addEventListener("click", async function (event) {
    const username = loginInput.value;
    console.log(username);
    if (username.length > 0 && isAlphanumeric(username)) {
        await initialiseStore(username);

        store.getItem("keyPair").then((kp) => {
            if (kp === null) {
                keyPair = nacl.sign.keyPair();
                console.log("keyPair generated");
                store.setItem("keyPair", keyPair);
                store.setItem("keyMap", keyMap);  // TODO: worry about what if we log out
                store.setItem("msgQueue", msgQueue);
            } else {
                console.log(`keypair ${JSON.stringify(kp)}`);
                keyPair = kp;
            }

            sendToServer({
                type: "login",
                name: username,
                pubKey: keyPair.publicKey
            });
        });
    }
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

ignoredInput.addEventListener("focus", () => { ignoredInput.selectedIndex = -1; });

ignoredInput.addEventListener("change", selectIgnored);

newChatBtn.addEventListener("click", createNewChat);

addUserBtn.addEventListener("click", async () => {
    if (currentChatID === 0) { console.alert(`Please select a chat`); return; }
    const username = modifyUserInput.value;
    try {
        const pk = await getPK(username);
        modifyUserInput.value = "";
        if (joinedChats.get(currentChatID).members.includes(JSON.stringify(pk))) { alert(`User has already been added`); return; }
        addToChat(new Map([[username, pk]]), currentChatID);
    } catch (err) {
        alert(`User does not exist`);
        console.log(err);
    }
});

removeUserBtn.addEventListener("click", async () => {
    if (currentChatID === 0) { console.alert(`Please select a chat`); return; }
    const username = modifyUserInput.value;
    try {
        const pk = await getPK(username);
        modifyUserInput.value = "";
        if (!joinedChats.get(currentChatID).members.includes(JSON.stringify(pk))) { alert(`Invalid username`); return; };
        removeFromChat(new Map([[username, pk]]), currentChatID);
    } catch (err) {
        alert(`User does not exist`);
    }
});

disputeBtn.addEventListener("click", async () => {
    disputeRemoval(joinedChats.get(currentChatID).toDispute, currentChatID);
    joinedChats.get(currentChatID).toDispute = null;
    updateHeading();
});

acceptRemovalBtn.addEventListener("click", async () => {
    console.log(`toDispute cleared`);
    joinedChats.get(currentChatID).toDispute = null;
    updateHeading();
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

const ignoredOptions = [];
var resolveGetIgnored;

function getIgnored(chatID, conc) {
    document.getElementById('universeSelection').style.display = "block";
    document.getElementById('chatBox').style.display = "none";
    var option;
    for (let i = ignoredInput.options.length - 1; i >= 0; i--) {
        ignoredInput.remove(i);
    }
    for (const op of conc) {
        option = document.createElement("option");
        option.text = `${op.action} ${keyMap.get(JSON.stringify(op.pk2))}`;
        ignoredInput.add(option);
        ignoredOptions.push(op);
    }
    console.log(`ignored ops length ${ignoredOptions.length}`);
    return new Promise((resolve) => {
        resolveGetIgnored = resolve;
    });
}

function selectIgnored() {
    console.log(`selected index ${ignoredInput.selectedIndex}`);
    resolveGetIgnored(ignoredOptions[ignoredInput.selectedIndex]);
    document.getElementById('chatBox').style.display = "block";
    document.getElementById('universeSelection').style.display = "none";
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

function updateHeading() {
    const title = document.getElementById('heading');
    title.innerHTML = `I know this is ugly, but Welcome ${localUsername}`;
    if (joinedChats.size > 0) {
        const availableChats = document.getElementById('availableChats');
        availableChats.innerHTML = `Chats: ${getChatNames().join(", ")}`;
    }

    if (currentChatID > 0) {
        const chatTitle = document.getElementById('chatHeading');
        chatTitle.innerHTML = `Chat: ${chatNameInput.value}`;

        const chatMembers = document.getElementById('chatMembers');
        chatMembers.innerHTML = `Members: ${joinedChats.get(currentChatID).members.filter(pk => !joinedChats.get(currentChatID).exMembers.includes(pk)).map(pk => keyMap.get(pk)).join(", ")}`;

        document.getElementById('chatModsAdded').style.display = joinedChats.get(currentChatID).currentMember ? "block" : "none";
        document.getElementById('chatModsRemoved').style.display = joinedChats.get(currentChatID).toDispute === null ? "none" : "block";
    }
}

function selectChat() {
    const index = chatNameInput.selectedIndex;

    if (index > 0) {
        const chatName = chatNameInput.options.item(index).text;
        currentChatID = getChatID(chatName);
        updateHeading();
        chatMessages.innerHTML = "";
        store.getItem(currentChatID).then(async (chatInfo) => {
            for (const data of chatInfo.history) {
                await updateChatWindow(data);
            }
        });
    }
}

const chatOptions = new Set();

function updateChatOptions(operation, chatID) {
    var option = document.createElement("option");
    if (operation === "add" && !chatOptions.has(chatID)) {
        option.text = joinedChats.get(chatID).chatName;
        chatNameInput.add(option);
        chatOptions.add(chatID);
        return;
    }

    if (operation === "remove" && chatOptions.has(chatID)) {
        const index = [...joinedChats.keys()].indexOf(chatID);
        chatNameInput.remove(index);
        chatOptions.delete(chatID);
    }
}

function createNewChat() {
    let newChatName = document.getElementById('newChatName').value;
    var member;
    var members = [];

    for (let i = 1; i < 3; i++) {
        member = document.getElementById(`member${i}`).value;
        if (member !== "" && member !== localUsername && !members.includes(member)) {
            members.push(member);
        }
    }

    sendToServer({
        type: "createChat",
        chatName: newChatName,
        from: keyPair.publicKey,
        members: members
    });
}

///////////
// UTILS //
///////////

function isAlphanumeric(str) {
    return str === str.replace(/[^a-z0-9]/gi, '');
}

function unpackOp(op) {
    op.sig = objToArr(op.sig);
    if (op.action === "create") {
        op.pk = objToArr(op.pk);
        op.nonce = objToArr(op.nonce);
    } else {
        op.pk1 = objToArr(op.pk1);
        op.pk2 = objToArr(op.pk2);
        op.deps = op.deps.map(dep => objToArr(dep));
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

function unionOps(ops1, ops2) {
    const sigSet = new Set(ops1.map(op => JSON.stringify(op.sig)));
    const ops = [...ops1];
    for (const op of ops2) {
        if (!sigSet.has(JSON.stringify(op.sig))) { ops.push(op); }
    }
    console.log(`ops1 length ${ops1.length}   ops2 length ${ops2.length}    ops length ${ops.length}`);
    return ops;
}

function hasOp(ops, op) {
    for (const curOp of ops) {
        if (arrEqual(curOp.sig, op.sig)) { return true; }
    }
    return false;
}

function opsArrEqual (ops1, ops2) {
    if (ops1.length !== ops2.length) { return false; }

    const sigSet = new Set(ops1.map(op => JSON.stringify(op.sig)));
    for (const op of ops2) {
        if (!sigSet.has(JSON.stringify(op.sig))) {
            return false;
        }
    }
    return true;
}

function removeOp(ops, op) {
    for (let i = 0; i < ops.length; i++) {
        if (arrEqual(ops[i].sig, op.sig)) {
            ops.splice(i, 1);
        }
    }
}

function strToArr(str) {
    return objToArr(JSON.parse(str));
}

function objToArr(obj) {
    return Uint8Array.from(Object.values(obj));
}

function formatDate(now) {
    const date = new Date(now);
    const intl = new Intl.DateTimeFormat('en-UK').format(date);
    return `${intl} ${date.getHours()}:${date.getMinutes() < 10 ? "0" : ""}${date.getMinutes()}`;
}

function mergeJoinedChats(localChats, receivedChats) {
    const mergedChats = new Map([...localChats]);
    if (receivedChats.size === 0) { return mergedChats; }
    const localChatIDs = new Set([...localChats.keys()]);
    for (const id of receivedChats.keys()) {
        if (!localChatIDs.has(id)) {
            mergedChats.set(id, receivedChats.get(id));
        }
    }
    return mergedChats;
}

function mergeChatHistory(localMsg, receivedMsg) {
    console.log(`local length ${localMsg.length}`);
    if (receivedMsg.size === 0) { return localMsg; }
    const mergedChatHistory = localMsg;
    const localMsgIDs = new Set(localMsg.map(msg => msg.id));
    for (const msg of receivedMsg) {
        if (!localMsgIDs.has(msg.id)) {
            mergedChatHistory.push(msg);
        }
    }
    return mergedChatHistory.sort((a, b) => {
        if (a.sentTime > b.sentTime) { return 1; }
        if (a.sentTime < b.sentTime) { return -1; }
        if (a.username > b.username) { return 1; }
        else { return -1; } // (a[1].username <= b[1].username) but we know it can't be == and from the same timestamp
    });
}

function closeConnections(pk) {
    console.log(`connection with ${keyMap.get(pk)} closed`);
    if (connections.has(pk)) {
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
}
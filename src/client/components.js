import { selectChat, removeFromChat } from './client.js';

const ns = "http://www.w3.org/2000/svg";

const createPopup = document.getElementById('createPopup');
const loginPopup = document.getElementById('loginPopup');
const dim = document.getElementById('dim');

const chatInfo = document.getElementById('chatInfo');
const chatNameInput = document.getElementById('chatNameInput');
const showChatInfoBtn = document.getElementById('showChatInfoBtn');

export function generateCardHTML (type, text, userID=null, notif=false, ops=null) {
    var card;
    const h3 = document.createElement("h3");
    const h3Text = document.createTextNode(text);
    h3.appendChild(h3Text);

    switch (type) {
        case "chat":
            card = document.createElement("button");
            card.className = "card";
            card.onclick = (() => {
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
            })

            if (notif) {
                const icon = document.createElement("i");
                icon.className = "fa-solid fa-circle fa-2xs notif";
                card.appendChild(icon);
            }
            card.appendChild(h3);
            break;
        case "user":
            card = document.createElement("div");
            card.className = "card";

            const icon = document.createElement("i");
            icon.className = "fa-solid fa-user-xmark"

            const button = document.createElement("button");
            button.class = "removeUserBtn";
            button.onclick = (async () => {
                removeFromChat(new Map([[username, await getPK(text)]]), currentChatID);
            });

            button.appendChild(icon)
            card.appendChild(button)
            card.appendChild(h3)
            break;
        case "conflict":
            break;
    }
    return card;
}

export function generateChatCard (chatID, chatName) {
    const card = document.createElement("button");
    card.id = `chatCard${chatID}`;
    card.className = "card";
    card.onclick = (async () => selectChat(chatID));

    const h3 = document.createElement("h3");
    const h3Text = document.createTextNode(chatName);
    h3.appendChild(h3Text);
    card.appendChild(h3);

    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M256 512c141.4 0 256-114.6 256-256S397.4 0 256 0S0 114.6 0 256S114.6 512 256 512z");
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("xmlns", ns);
    svg.setAttributeNS(ns, "viewBox", "0 0 512 512");
    svg.appendChild(path);
    card.appendChild(svg);

    return card;
}

export function generateUserCard (pk, username, chatID) {
    const card = document.createElement("div");
    card.id = `userCard${username}`;
    card.className = "card";

    const h3 = document.createElement("h3");
    const h3Text = document.createTextNode(username);
    h3.appendChild(h3Text);
    card.appendChild(h3);

    const button = document.createElement("button");
    button.className = "removeUserBtn";
    button.onclick = (async () => {
        removeFromChat(new Map([[username, pk]]), chatID);
        console.log(`click`);
    });
    console.log(`set onclick`);

    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z");
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("xmlns", ns);
    svg.setAttributeNS(ns, "viewBox", "0 0 640 512");

    svg.appendChild(path);
    button.appendChild(svg);
    card.appendChild(button);

    return card;
}


document.getElementById('createChatBtn').onclick = (() => {
    createPopup.style.display = "flex";
    chatNameInput.focus();
    chatNameInput.select();
});

document.getElementById('showChatInfoBtn').onclick = (() => {
    chatInfo.style.display = chatInfo.style.display === "flex" ? "none" : "flex";
});

document.getElementById('closeChatInfo').onclick = (() => {
    chatInfo.style.display = "none";
});

[...document.getElementsByClassName('close-popup')].map((elem) => {
    elem.onclick = closePopup;
});

export function closePopup() {
    if (loginPopup.style.display === "none" && createPopup.style.display === "flex") {
        dim.style.display = "none";
        createPopup.style.display = "none";
    }
}
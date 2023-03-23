import { selectChat, removeFromChat } from './client.js';

const createPopup = document.getElementById('createPopup');
const loginPopup = document.getElementById('loginPopup');
const dim = document.getElementById('dim');

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

export function generateChatCard (chatID, chatName, notif) {
    const card = document.createElement("button");
    card.id = `chatCard${chatID}`;
    card.className = "card";
    card.onclick = (async () => selectChat(chatID));

    const h3 = document.createElement("h3");
    const h3Text = document.createTextNode(chatName);
    h3.appendChild(h3Text);
    card.appendChild(h3);

    if (notif) {
        const path = document.createElement("path");
        path.d = "M256 512c141.4 0 256-114.6 256-256S397.4 0 256 0S0 114.6 0 256S114.6 512 256 512z";
        const svg = document.createElement("svg");
        svg.className = "notif";
        svg.xmlns = "http://www.w3.org/2000/svg";
        svg.view = "0 0 512 512";
        svg.appendChild(path);
        card.appendChild(svg);
    }

    return card;
}

export function generateUserCard (pk, username) {
    const card = document.createElement("div");
    card.className = "card";

    const h3 = document.createElement("h3");
    const h3Text = document.createTextNode(user);
    h3.appendChild(h3Text);
    card.appendChild(h3);

    const button = document.createElement("button");
    button.class = "removeUserBtn";
    button.onclick = (async () => {
        removeFromChat(new Map([[username, pk]]), currentChatID);
    });
    card.appendChild(button);

    const path = document.createElement("path");
    path.d = "M96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM0 482.3C0 383.8 79.8 304 178.3 304h91.4C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7H29.7C13.3 512 0 498.7 0 482.3zM471 143c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z";
    const svg = document.createElement("svg");
    svg.xmlns = "http://www.w3.org/2000/svg";
    svg.view = "0 0 640 512";
    svg.appendChild(path);
    button.appendChild(svg);

    return card;
}


document.getElementById('createChatBtn').onclick = (() => {
    createPopup.style.display = "flex";
});

document.getElementById('showChatInfoBtn').onclick = (() => {
    document.getElementById('chatInfo').style.display = "flex";
});

document.getElementById('closeChatInfo').onclick = (() => {
    document.getElementById('chatInfo').style.display = "none";
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
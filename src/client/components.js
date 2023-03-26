import { selectChat, removeFromChat } from './client.js';

const ns = "http://www.w3.org/2000/svg";

const createPopup = document.getElementById('createPopup');
const loginPopup = document.getElementById('loginPopup');
const dim = document.getElementById('dim');

const chatInfo = document.getElementById('chatInfo');
const chatNameInput = document.getElementById('chatNameInput');
const showChatInfoBtn = document.getElementById('showChatInfoBtn');

const chatCardTemplate = document.getElementById('chatCardTemplate');
const userCardTemplate = document.getElementById('userCardTemplate');

const memberList = document.getElementById('memberList');
const chatList = document.getElementById('chatList');


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
    const cardCopy = chatCardTemplate.cloneNode(true);
    cardCopy.id = `chatCard${chatID}`;
    cardCopy.className = `class`
    chatList.insertBefore(cardCopy, chatList.firstElementChild);

    const card = document.getElementById(`chatCard${chatID}`);
    console.log(`card found ${card.childNodes.length}`);
    card.addEventListener("click", () => selectChat(chatID));

    const h3 = card.childNodes[1];
    const text = document.createTextNode(chatName);
    h3.appendChild(text);

    return card;
}

export function generateUserCard (pk, username, chatID) {
    var card = userCardTemplate.cloneNode(true);
    card.id = `userCard${username}`;

    const h3 = card.childNodes[1];
    const text = document.createTextNode(username);
    h3.appendChild(text);

    const button = card.getElementsByClassName("removeUserBtn")[0];
    button.addEventListener("click", () => removeFromChat.bind(new Map([[username, pk]]), chatID));

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
const createPopup = document.getElementById('createPopup');
const loginPopup = document.getElementById('loginPopup');
const dim = document.getElementById('dim');

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
    card.className = "card";
    card.onclick = (async () => selectChat(chatID));

    const h3 = document.createElement("h3");
    const h3Text = document.createTextNode(chatName);
    h3.appendChild(h3Text);
    card.appendChild(h3);

    if (notif) {
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-circle fa-2xs notif";
        card.appendChild(icon);
    }

    return card;
}

export function generateUserCard (user) {
    const card = document.createElement("div");
    card.className = "card";

    const h3 = document.createElement("h3");
    const h3Text = document.createTextNode(user);
    h3.appendChild(h3Text);
    card.appendChild(h3);

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-user-xmark";
    button.appendChild(icon);

    const button = document.createElement("button");
    button.class = "removeUserBtn";
    button.onclick = (async () => {
        removeFromChat(new Map([[username, await getPK(text)]]), currentChatID);
    });

    card.appendChild(button);
}

export function showCreatePopup() {
    createChat.style.display = "flex";
}

export function closePopup() {
    if (loginPopup.style.display === "none" && createPopup.style.display === "flex") {
        dim.style.display = "none";
        createPopup.style.display = "none";
    }
}
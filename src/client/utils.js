export function strToArr(str) {
    return objToArr(JSON.parse(str));
}

export function objToArr(obj) {
    return Uint8Array.from(Object.values(obj));
}

export function formatDate(now) {
    const date = new Date(now);
    const intl = new Intl.DateTimeFormat('en-UK').format(date);
    return `${intl} ${date.getHours() < 10 ? "0" : ""}${date.getHours()}:${date.getMinutes() < 10 ? "0" : ""}${date.getMinutes()}`;
}

export function arrEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) { return false; }
    let index = 0;
    while (index < arr1.length) {
        if (arr1[index] !== arr2[index]) { return false; }
        index++;
    }
    return true;
}

export function isAlphanumeric(str) {
    return str === str.replace(/[^a-z0-9]/gi, '');
}
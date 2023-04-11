export function strToArr (str) {
    return objToArr(JSON.parse(str));
}

export function testStrToArr (str) {
    return Uint8Array.from(str.match(/.{1,2}/g).map(s => parseInt(s, 16)));
}

export function testArrToStr (arr) {
    return Array.from(arr).map(n => {
        return n.toString(16).padStart(2, '0');
    }).join("");
}

export function objToArr (obj) {
    return Uint8Array.from(Object.values(obj));
}

export function concatArr (arr1, arr2) {
    const merged = new Uint8Array(arr1.length + arr2.length);
    merged.set(arr1);
    merged.set(arr2, arr1.length);
    return merged;
}

export function formatDate (now) {
    const date = new Date(now);
    const intl = new Intl.DateTimeFormat('en-US', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit'
      }).format(date);
    return `${intl} ${date.getHours() < 10 ? "0" : ""}${date.getHours()}:${date.getMinutes() < 10 ? "0" : ""}${date.getMinutes()}`;
}

export function arrEqual (arr1, arr2) {
    if (arr1.length !== arr2.length) { return false; }
    let index = 0;
    while (index < arr1.length) {
        if (arr1[index] !== arr2[index]) { return false; }
        index++;
    }
    return true;
}

export function isAlphanumeric (str) {
    return str === str.replace(/[^a-z0-9]/gi, '');
}

export function xorArr (arr1, arr2) {
    if (arr1.length != arr2.length) { return false; }

    const res = new Uint8Array(arr1.length);
    for (let i=0; i < arr1.length; i++) {
        res[i] = arr1[i] ^ arr2[i];
        console.log(`${arr1[i]} ${arr2[i]} ${res[i]}`);
    }
    return res;
}

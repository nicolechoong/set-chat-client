import * as unit from '../../src/client/accessControl.js';
import nacl from 'tweetnacl';
import { createObjectCsvWriter } from 'csv-writer';

import { arrToStr } from '../../src/client/utils.js';

const keyPairs = [];
for (let i = 0; i <= 256; i++) {
    keyPairs.push(nacl.sign.keyPair());
    keyPairs[i].publicKey = arrToStr(keyPairs[i].publicKey);
}

const csvWriter = createObjectCsvWriter({
    path: './performanceData3.csv',
    header: [
        { id: 'n', title: 'Number of Operations' },
        // {id: 'gen', title: 'Generating Operations'},
        // { id: 'mem', title: 'Computing Members (Adds only)' },
        // { id: 'chain', title: 'Computing Members (Chained adds)' },
        // {id: 'ar', title: 'Computing Members (AddRemove)'},
        // {id: 'aaar', title: 'Computing Members (AddAddAddRemove)'},
        {id: 'aacr', title: 'Concurrent Remove'},
        // {id: 'aacrv', title: 'Concurrent Remove (Verif)'},
        // {id: 'aacra', title: 'Concurrent Remove (Authority)'},
        // {id: 'aacrm', title: 'Concurrent Remove (Members)'}
    ]
});

const data = [];

function resetStructures() {
    unit.hashedOps.clear();
    unit.seenPrecedes.clear();
    unit.seenNotPrecedes.clear();
}

let before, after, generated, verifiedOps, localOps, ignored;
for (let i = 1; i <= 256; i++) {
    console.log(i);
    before = {};
    after = {};

    // before.gen = performance.now();
    // generated = generateAddByOne(i);
    // after.gen = performance.now();

    // localOps = generated.slice(0, i);
    // verifiedOps = []
    // resetStructures();
    // before.mem = performance.now();
    // unit.verifiedOperations(generated, localOps, new Map(), verifiedOps);
    // unit.members(verifiedOps, []);
    // after.mem = performance.now();

    // generated = generateAdd(i);
    // localOps = generated.slice(0, i);
    // verifiedOps = []
    // resetStructures();
    // before.chain = performance.now();
    // unit.verifiedOperations(generated, localOps, new Map(), verifiedOps);
    // unit.members(verifiedOps, []);
    // after.chain = performance.now();

    // generated = generateAddRemove(i);
    // localOps = generated.slice(0, i+1);
    // verifiedOps = []
    // resetStructures();
    // before.ar = performance.now();
    // unit.verifiedOperations(generated, localOps, new Map(), verifiedOps);
    // unit.members(verifiedOps, []);
    // after.ar = performance.now();

    // generated = generateAddAddAddRemove(i);
    // localOps = generated.slice(0, i);
    // verifiedOps = []
    // resetStructures();
    // before.aaar = performance.now();
    // unit.verifiedOperations(generated, localOps, new Map(), verifiedOps);
    // unit.members(verifiedOps, []);
    // after.aaar = performance.now();

    generated = generateAddAddConcRemove(i);
    localOps = generated.slice(0, i);
    verifiedOps = []
    ignored = generated.filter((_, index) => index % 4 == 3);
    resetStructures();
    before.aacr = performance.now();
    unit.verifiedOperations(generated, localOps, new Map(), verifiedOps);
    unit.members(verifiedOps, ignored, before);
    after.aacr = performance.now();

    data.push({
        n: i,
        // gen: after.gen - before.gen, 
        // mem: after.mem - before.mem,
        // chain: after.chain - before.chain,
        // aaar: after.aaar - before.aaar,
        // ar: after.ar - before.ar,
        aacr: after.aacr - before.aacr,
        // aacrv: before.aacr2 - before.aacr,
        // aacra: before.aacr3 - before.aacr2,
        // aacrm: after.aacr - before.aacr3,
    });
}

csvWriter
.writeRecords(data)
.then(() => console.log('The CSV file was written successfully'));

// "generate"
function generateAdd(n) {
    const ops = [unit.generateCreateOp(keyPairs[0])];
    for (let i = 1; i <= n; i++) {
        ops.push(unit.generateOp("add", keyPairs[i].publicKey, ops, keyPairs[i - 1]));
    }
    return ops
}

function generateAddByOne(n) {
    const ops = [unit.generateCreateOp(keyPairs[0])];
    for (let i = 1; i <= n; i++) {
        ops.push(unit.generateOp("add", keyPairs[i].publicKey, ops, keyPairs[0]));
    }
    return ops
}

function generateAddAddAddRemove(n) {
    // 1 adds 0, 1 adds 2, 2 adds 3, 3 removes 2
    // 1 adds 2, 3 adds 4, 4 adds 5, 5 removes 4
    // 1 adds 4, 5 adds 6, 6 adds 7, 7 removes 6
    const ops = [unit.generateCreateOp(keyPairs[1])];
    for (let i = 0; i < n; i++) {
        switch (i % 4) {
            case 0:
                ops.push(unit.generateOp("add", keyPairs[Math.floor(i / 2)].publicKey, ops, keyPairs[1]));
                break;
            case 1:
                ops.push(unit.generateOp("add", keyPairs[Math.floor(i / 2) + 2].publicKey, ops, keyPairs[Math.floor(i / 2) + 1]));
                break;
            case 2:
                ops.push(unit.generateOp("add", keyPairs[Math.floor(i / 2) + 2].publicKey, ops, keyPairs[Math.floor(i / 2) + 1]));
                break;
            case 3:
                ops.push(unit.generateOp("remove", keyPairs[Math.floor(i / 2) + 1].publicKey, ops, keyPairs[Math.floor(i / 2) + 2]));
                break;
        }
    }
    return ops
}

function generateAddRemove(n) {
    // 0 adds 1, 1 removes 0, 1 adds 0, 0 removes 1
    const ops = [unit.generateCreateOp(keyPairs[0])];
    for (let i = 0; i < n; i++) {
        switch (i % 4) {
            case 0:
                ops.push(unit.generateOp("add", keyPairs[1].publicKey, ops, keyPairs[0]));
                break;
            case 1:
                ops.push(unit.generateOp("remove", keyPairs[0].publicKey, ops, keyPairs[1]));
                break;
            case 2:
                ops.push(unit.generateOp("add", keyPairs[0].publicKey, ops, keyPairs[1]));
                break;
            case 3:
                ops.push(unit.generateOp("remove", keyPairs[1].publicKey, ops, keyPairs[0]));
                break;
        }
    }
    return ops
}

function generateAddAddConcRemove(n) {
    // 0 adds 1, 1 adds 2, 2 removes 1, 1 removes 2,
    // 0 adds 3, 3 adds 4, 4 removes 3, 3 removes 4,
    // 0 adds 5, 5 adds 6, 6 removes 5, 5 removes 6,
    const ops = [unit.generateCreateOp(keyPairs[0])];
    var concOp;
    for (let i = 0; i < n; i++) {
        switch (i % 4) {
            case 0:
                ops.push(unit.generateOp("add", keyPairs[Math.floor(i / 2) + 1].publicKey, ops, keyPairs[0]));
                break;
            case 1:
                ops.push(unit.generateOp("add", keyPairs[Math.floor(i / 2) + 2].publicKey, ops, keyPairs[Math.floor(i / 2) + 1]));
                break;
            case 2:
                concOp = unit.generateOp("remove", keyPairs[Math.floor(i / 2)].publicKey, ops, keyPairs[Math.floor(i / 2) + 1]);
                break;
            case 3:
                ops.push(unit.generateOp("remove", keyPairs[Math.floor(i / 2) + 1].publicKey, ops, keyPairs[Math.floor(i / 2)]));
                ops.push(concOp);
                break;
        }
    }
    if (n % 4 == 3) {
        ops.push(concOp);
    }
    return ops
}

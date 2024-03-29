import { arrToStr, strToArr, xorArr, concatArr } from "./utils.js";
import { keyPair as clientKeyPair } from './client.js';
import nacl from '../../node_modules/tweetnacl-es6/nacl-fast-es.js';
// import nacl from '../../node_modules/tweetnacl/nacl-fast.js';
// const clientKeyPair = nacl.box.keyPair();

export const enc = new TextEncoder();
export var hashedOps = new Map();

export function unresolvedCycles (cycles, ignored) {
    cycleloop:
    for (const cycle of cycles) {
        for (const op of cycle) {
            if (hasOp(ignored, op)) {
                continue cycleloop;
            }
        }
        return true;
    }
    return false;
}

function findCycle (fromOp, visited, stack, cycle) {
    // assume start is create
    const cur = stack.at(-1);
    for (const next of fromOp.get(cur.sig)) {
        if (visited.get(next.sig) === "IN STACK") {
            cycle.push([...stack.slice(stack.findIndex((op) => (op.sig === next.sig)))]);
        } else if (visited.get(next.sig) === "NOT VISITED") {
            stack.push(next);
            visited.set(next.sig, "IN STACK");
            findCycle(fromOp, visited, stack, cycle);
        }
    }
    visited.set(cur.sig, "DONE");
    stack.pop();
}

export function hasCycles (ops) {
    const edges = authority(ops).edges;
    const start = ops.filter(op => op.action === "create")[0]; // verifyOps means that there's only one
    const fromOp = new Map();

    for (const edge of edges) {
        if (!fromOp.has(edge.from.sig)) {
            fromOp.set(edge.from.sig, []);
        }
        if (edge.to.action !== "mem") {
            fromOp.get(edge.from.sig).push(edge.to);
        }
    }

    const cycles = [];
    findCycle(fromOp, new Map(ops.map((op) => [op.sig, "NOT VISITED"])), [start], cycles);
    if (cycles.length === 0) {
        return { cycle: false };
    }

    const toOp = new Map(cycles.flat().map((op) => [op.sig, 0]));
    for (let i=0; i < cycles.length; i++) {
        for (const edge of edges) {
            if (hasOp(cycles[i], edge.to)) {
                toOp.set(edge.to.sig, toOp.get(edge.to.sig)+1);
            }
        }
        // cycles[i] = cycles[i].filter((op) => toOp.get(op.sig) >= 2);
    }
    return { cycle: true, concurrent: cycles };
}

export function earliestSubset (ops) {
    const hashedSubset = new Set(ops.map(op => hashOp(op)));
    const subset = [];

    for (const op of ops) {
        for (const dep of op.deps) {
            if (!hashedSubset.has(dep)) {
                subset.push(op);
            }
        }
    }
    return subset;
}
export function getDeps (operations) {
    // operations : Array of Object
    var deps = [];
    const seenDeps = new Set();
    for (const op of operations) {
        if (op.action === "create") { continue; }
        op.deps.forEach(dep => seenDeps.add(dep));
    }
    for (const op of operations) {
        const hashedOp = hashOp(op);
        if (!seenDeps.has(hashedOp)) {
            deps.push(hashedOp);
        }
    }
    return deps;
}

export function concatOp (op) {
    return op.action === "create" ? `${op.action}${op.pk}${op.nonce}` : `${op.action}${op.pk1}${op.pk2}${op.deps}`;
}

export function generateChatID (op) {
    return arrToStr(nacl.hash(enc.encode(`${op.action}${op.pk}${op.nonce}${op.sig}`)));
}

export function hasOp (ops, op) {
    for (const curOp of ops) {
        if (curOp.sig === op.sig) { return true; }
    }
    return false;
}

export function generateCreateOp (keyPair=clientKeyPair) {
    const op = {
        action: 'create',
        pk: keyPair.publicKey,
        nonce: arrToStr(nacl.randomBytes(64)),
    };
    op["sig"] = arrToStr(nacl.sign.detached(enc.encode(concatOp(op)), keyPair.secretKey));
    return op;
}

export function generateOp (action, pk2, ops, keyPair=clientKeyPair) {
    // action: String, chatID: String, pk2: string, ops: Array of Object
    const op = {
        action: action,
        pk1: keyPair.publicKey,
        pk2: pk2,
        deps: getDeps(ops)
    };
    op["sig"] = arrToStr(nacl.sign.detached(enc.encode(concatOp(op)), keyPair.secretKey));
    return op;
}

export function generateDisputeOp (action, pk2, deps, keyPair=clientKeyPair) {
    // action: String, chatID: String, pk2: string, ops: Array of Object
    const op = {
        action: action,
        pk1: keyPair.publicKey,
        pk2: pk2,
        deps: deps
    };
    op["sig"] = arrToStr(nacl.sign.detached(enc.encode(concatOp(op)), keyPair.secretKey));
    return op;
}

function resolvedHash(hash, unresolvedHashes) {
    const resolved = []
    for (const [sig, unres] of unresolvedHashes) {
        if (unres.hashes.delete(hash) && unres.hashes.size == 0) {
            resolved.push(unres.op);
            unresolvedHashes.delete(sig);
        }
    }
    return resolved
}

export function verifiedOperations (receivedOps, localOps, unresolvedHashes, verifiedOps) {
    // hashedOps = new Map();

    verifiedOps.push(...localOps);
    const localSet = new Set(localOps.map((op) => op.sig));
    var verified = true;

    // hashedOps
    localOps.forEach((op) => {
        hashedOps.set(hashOp(op), op);
    });

    // checking received create op is the same as local
    // assert that the local set will only ever have one create operation
    const receivedCreateOps = receivedOps.filter((op) => op.action === "create");
    if (receivedCreateOps.length == 1) {
        const op = receivedCreateOps[0];
        if (!nacl.sign.detached.verify(enc.encode(concatOp(op)), strToArr(op.sig), strToArr(op.pk))
        || localOps.filter((oplocal) => oplocal.action === "create")[0].sig !== op.sig) {
            console.log(`verif failed: create op sig invalid`);
            verified = false;
        }
    } else {
        console.log(`verif failed: not one create op`);
        verified = false;
    }

    // filter out all received operations with invalid signatures and create
    
    if (receivedOps.findIndex((op) => op.action !== "create" && !nacl.sign.detached.verify(enc.encode(concatOp(op)), strToArr(op.sig), strToArr(op.pk1))) > -1) {
        console.log(`verif failed: invalid sig`);
        verified = false;
    }
    
    receivedOps = new Set(receivedOps.filter((op) => (op.action !== "create" && nacl.sign.detached.verify(enc.encode(concatOp(op)), strToArr(op.sig), strToArr(op.pk1)) && !localSet.has(op.sig))));

    var change;
    do {
        change = false;
        for (const op of receivedOps) {
            var unresolved = new Set();
            for (const dep of op.deps) {
                if (!hashedOps.has(dep)) { unresolved.add(dep) }
            }
            if (unresolved.size == 0) {
                change = true;
                hashedOps.set(hashOp(op), op);
                receivedOps.delete(op);
                verifiedOps.push(op, ...resolvedHash(hashOp(op), unresolvedHashes));
            } else {
                unresolvedHashes.set(op.sig, {op: op, hashes: unresolved});
            }
        }
    } while (change)
    if (receivedOps.size > 0) { verified = false; console.log(`verif failed: unresolved deps`); }

    return verified;
}

export function hashOp (op) {
    return arrToStr(nacl.hash(enc.encode(op.action === "create" ? `${op.action}${op.pk}${op.nonce}${op.sig}` : `${op.action}${op.pk1}${op.pk2}${op.deps}${op.sig}`)));
}

export function hashOpArray (ops) {
    return arrToStr(nacl.hash(enc.encode(ops.map(op => op.sig).join(""))));
}

function getOpFromHash(hashedOp) {
    if (hashedOps.has(hashedOp)) { return hashedOps.get(hashedOp); }
    else { alert('missing dependency'); }
}

export const seenPrecedes = new Map();
export const seenNotPrecedes = new Map();

// takes in set of ops
export function precedes (ops, op1, op2) {
    if (seenPrecedes.has(op1.sig) && seenPrecedes.get(op1.sig).has(op2.sig)) { return true; }
    if ((seenNotPrecedes.has(op1.sig) && seenNotPrecedes.get(op1.sig).has(op2.sig)) || (seenPrecedes.has(op2.sig) && seenPrecedes.get(op2.sig).has(op1.sig))) { return false; }
    if (!hasOp(ops, op2) || !hasOp(ops, op1)) { return false; }
    const toVisit = [op2];
    const target = hashOp(op1);
    let curOp, dep;
    while (toVisit.length > 0) {
        curOp = toVisit.pop();
        for (const hashedDep of curOp.deps) {
            if (hashedDep === target) {
                if (!seenPrecedes.has(op1.sig)) {
                    seenPrecedes.set(op1.sig, new Set());
                }
                seenPrecedes.get(op1.sig).add(op2.sig);
                return true;
            } else {
                dep = getOpFromHash(hashedDep);
                if (!seenPrecedes.has(dep.sig)) {
                    seenPrecedes.set(dep.sig, new Set());
                }
                seenPrecedes.get(dep.sig).add(curOp.sig);
                if (dep.action !== "create") {
                    toVisit.push(dep);
                }
            }
        }
    }
    if (!seenNotPrecedes.has(op1.sig)) {
        seenNotPrecedes.set(op1.sig, new Set());
    }
    seenNotPrecedes.get(op1.sig).add(op2.sig);
    return false;
}

function concurrent (ops, op1, op2) {
    if (op1.sig !== op2.sig && !precedes(ops, op1, op2) && !precedes(ops, op2, op1) && hasOp(ops, op1) && hasOp(ops, op2)) { return true; }
    return false;
}

export function precedesS (opSig, op1, op2) {
    if (seenPrecedes.has(op1.sig) && seenPrecedes.get(op1.sig).has(op2.sig)) { return true; }
    if ((seenNotPrecedes.has(op1.sig) && seenNotPrecedes.get(op1.sig).has(op2.sig)) || (seenPrecedes.has(op2.sig) && seenPrecedes.get(op2.sig).has(op1.sig))) { return false; }
    if (!opSig.has(op2.sig) || !opSig.has(op1.sig)) { return false; }
    const toVisit = [op2];
    const target = hashOp(op1);
    let curOp, dep;
    while (toVisit.length > 0) {
        curOp = toVisit.pop();
        for (const hashedDep of curOp.deps) {
            if (hashedDep === target) {
                if (!seenPrecedes.has(op1.sig)) {
                    seenPrecedes.set(op1.sig, new Set());
                }
                seenPrecedes.get(op1.sig).add(op2.sig);
                return true;
            } else {
                dep = getOpFromHash(hashedDep);
                if (dep.action !== "create") {
                    if (dep.pk2 === op2.pk1) {
                        if (!seenPrecedes.has(dep.sig)) {
                            seenPrecedes.set(dep.sig, new Set());
                        }
                        seenPrecedes.get(dep.sig).add(op2.sig);
                    }
                    toVisit.push(dep);
                }
            }
        }
    }
    if (!seenNotPrecedes.has(op1.sig)) {
        seenNotPrecedes.set(op1.sig, new Set());
    }
    seenNotPrecedes.get(op1.sig).add(op2.sig);
    return false;
}

function concurrentS (opSig, op1, op2) {
    if (op1.sig !== op2.sig && opSig.has(op1.sig) && opSig.has(op2.sig) && !precedesS(opSig, op2, op1)) { return true; }
    return false;
}

function printEdge (op1, op2 = null) {
    var output = "";
    if (op1.action === "create") {
        output = `op1 ${op1.pk} ${op1.action}    ${op1.sig} `;
    } else {
        output = `op1 ${op1.pk1} ${op1.action} ${op1.pk2}`;
    }
    if (op2) {
        if (op2.action === "mem") {
            output = `${output} -> mem ${op2.pk}`;
        } else {
            output = `${output} -> op2 ${op2.pk1} ${op2.action} ${op2.pk2}`;
        }
    }
    console.log(output);
}

export function authority (ops) {
    const edges = [];
    const memberVertices = new Map();
    const opSigs = new Set(ops.map(op => op.sig));
    var pk;
    // convert pk into strings to perform comparisons
    for (const op1 of ops) {
        for (const op2 of ops) {
            if (op2.action === "create") { continue; }
            if ((((op1.action === "create" && op1.pk === op2.pk1) || (op1.action === "add" && op1.pk2 === op2.pk1)) && precedesS(opSigs, op1, op2))
                || ((op1.action === "remove" && op1.pk2 === op2.pk1) && (precedesS(opSigs, op1, op2) || concurrentS(opSigs, op1, op2)))) {
                edges.push({from: op1, to: op2});
            }
        }

        pk = op1.action == "create" ? op1.pk : op1.pk2;
        if (!memberVertices.has(pk)) { memberVertices.set(pk, { "pk": pk, "sig": pk, "action": "mem" })};
        edges.push({from: op1, to: memberVertices.get(pk)});
    }
    return { edges: edges, members: [...memberVertices.values()] };
}

function valid (ops, ignored, op, authorityGraph) {
    if (op.action === "create") { return true; }
    if (hasOp(ignored, op)) { return false; }

    // all the valid operations before op2
    const inSet = authorityGraph.filter((edge) => {
        return edge.to !== "mem" && op.sig === edge.to.sig && valid(ops, ignored, edge.from, authorityGraph);
    }).map(edge => edge.from);

    const removeIn = [];
    const addIn = [];

    inSet.forEach(op => { if (op.action == "remove") { removeIn.push(op) } else { addIn.push(op) }});
    addIn.reverse();
    removeIn.reverse();

    // looking for adds which aren't followed by removes
    addLoop:
    for (const opA of addIn) {
        for (const opR of removeIn) {
            if (precedes(ops, opA, opR)) {
                continue addLoop;
            }
        }
        return true;
        // if (removeIn.filter((opR) => precedes(ops, opA, opR)).length == 0) { return true; }
    }
    return false;
}

export function members (ops, ignored) {
    // assert that there are no cycles
    const pks = new Set();
    const authorityGraph = authority(ops);
    for (const memVertex of authorityGraph.members) {
        if (valid(ops, ignored, memVertex, authorityGraph.edges)) {
            pks.add(memVertex.pk);
        }
    }
    // console.log(`calculated member set ${[...pks]}      number of members ${pks.size}}`);
    return pks;
}

const ipad = new Uint8Array(Array(128).fill(54));
const opad = new Uint8Array(Array(128).fill(92));


export function hmac512 (k, m) {
    const kp = new Uint8Array(128);
    kp.set(k);
    return nacl.hash(concatArr(xorArr(kp, opad), nacl.hash(concatArr(xorArr(kp, ipad), m))));
}

const ipad256 = new Uint8Array(Array(64).fill(54));
const opad256 = new Uint8Array(Array(64).fill(92));

export function hmac256 (k, m) {
    const kp = new Uint8Array(64);
    kp.set(k);
    return nacl.hash(concatArr(xorArr(kp, opad256), nacl.hash(concatArr(xorArr(kp, ipad256), m))));
}

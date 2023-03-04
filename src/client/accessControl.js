import '../../node_modules/tweetnacl/nacl-fast.js';
import * as nacl from '../../node_modules/tweetnacl/nacl-fast.js';
import { arrEqual } from "./utils.js";

export const enc = new TextEncoder();
var hashedOps = new Map();

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
    for (const next of fromOp.get(JSON.stringify(cur.sig))) {
        if (visited.get(JSON.stringify(next.sig)) === "IN STACK") {
            cycle.push([...stack.slice(stack.findIndex((op) => arrEqual(op.sig, next.sig)))]);
        } else if (visited.get(JSON.stringify(next.sig)) === "NOT VISITED") {
            stack.push(next);
            visited.set(JSON.stringify(next.sig), "IN STACK");
            findCycle(fromOp, visited, stack, cycle);
        }
    }
    visited.set(JSON.stringify(cur.sig), "DONE");
    stack.pop();
}

export function hasCycles (ops) {
    console.log(ops.map(op => op.action));
    const edges = authority(ops);
    const start = ops.filter(op => op.action === "create")[0]; // verifyOps means that there's only one
    const fromOp = new Map();

    for (const edge of edges) {
        if (!fromOp.has(JSON.stringify(edge[0].sig))) {
            fromOp.set(JSON.stringify(edge[0].sig), []);
        }
        if (edge[1].action !== "mem") {
            fromOp.get(JSON.stringify(edge[0].sig)).push(edge[1]);
        }
    }

    const cycles = [];
    findCycle(fromOp, new Map(ops.map((op) => [JSON.stringify(op.sig), "NOT VISITED"])), [start], cycles);
    if (cycles.length === 0) {
        return { cycle: false };
    }

    const toOp = new Map(cycles.flat().map((op) => [JSON.stringify(op.sig), 0]));
    for (let i=0; i < cycles.length; i++) {
        for (const edge of edges) {
            if (hasOp(cycles[i], edge[1])) {
                toOp.set(JSON.stringify(edge[1].sig), toOp.get(JSON.stringify(edge[1].sig))+1);
            }
        }
        cycles[i] = cycles[i].filter((op) => toOp.get(JSON.stringify(op.sig)) >= 2);
    }
    return { cycle: true, concurrent: cycles };
}

function getDeps (operations) {
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

function concatOp (op) {
    return op.action === "create" ? `${op.action}${op.pk}${op.nonce}` : `${op.action}${op.pk1}${op.pk2}${op.deps}`;
}

export function hasOp(ops, op) {
    for (const curOp of ops) {
        if (arrEqual(curOp.sig, op.sig)) { return true; }
    }
    return false;
}

export async function generateOp (action, keyPair, pk2 = null, ops = []) {
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

// takes in set of ops
export function verifyOperations (ops) {

    // only one create
    const createOps = ops.filter((op) => op.action === "create");
    if (createOps.length != 1) { console.log("op verification failed: not one create"); return false; }
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

export function hashOp (op) {
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

export function authority (ops) {
    const edges = [];
    var pk;
    // convert pk into strings to perform comparisons
    for (const op1 of ops) {
        for (const op2 of ops) {
            if (op2.action === "create") { continue; }
            if ((((op1.action === "create" && arrEqual(op1.pk, op2.pk1)) || (op1.action === "add" && arrEqual(op1.pk2, op2.pk1))) && precedes(ops, op1, op2))
                || ((op1.action === "remove" && arrEqual(op1.pk2, op2.pk1)) && (precedes(ops, op1, op2) || concurrent(ops, op1, op2)))) {
                edges.push([op1, op2]);
            }
        }

        pk = op1.action == "create" ? op1.pk : op1.pk2;
        edges.push([op1, { "member": pk, "sig": pk, "action": "mem" }]);
    }
    return edges;
}

function valid (ops, ignored, op, authorityGraph) {
    if (op.action === "create") { return true; }
    if (op.action !== "mem" && hasOp(ignored, op)) { return false; }

    // all the valid operations before op2
    const inSet = authorityGraph.filter((edge) => {
        return arrEqual(op.sig, edge[1].sig) && valid(ops, ignored, edge[0], authorityGraph);
    }).map(edge => edge[0]);
    const removeIn = inSet.filter(r => (r.action === "remove"));

    // ADD COMMENTS
    for (const opA of inSet) {
        if (opA.action === "create" || opA.action === "add") {
            if (removeIn.filter(opR => precedes(ops, opA, opR)).length === 0) {
                return true;
            }
        }
    }
    return false;
}

export async function members (ops, ignored) {
    // assert that there are no cycles
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
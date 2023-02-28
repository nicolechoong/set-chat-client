// takes in set of ops
export function verifyOperations (ops) {

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
import * as unit from '../../src/client/accessControl.js';
import * as nacl from '../../node_modules/tweetnacl/nacl-fast.js';
import { arrToStr, strToArr } from '../../src/client/utils.js';
import { expect, test, describe, beforeAll, beforeEach } from '@jest/globals';

const keyPairs = {
    "a": nacl.sign.keyPair(),
    "b": nacl.sign.keyPair(),
    "c": nacl.sign.keyPair(),
    "d": nacl.sign.keyPair(),
    "e": nacl.sign.keyPair(),
    "f": nacl.sign.keyPair(),
}
keyPairs.a.publicKey = arrToStr(keyPairs.a.publicKey);
keyPairs.b.publicKey = arrToStr(keyPairs.b.publicKey);
keyPairs.c.publicKey = arrToStr(keyPairs.c.publicKey);
keyPairs.d.publicKey = arrToStr(keyPairs.d.publicKey);
keyPairs.c.publicKey = arrToStr(keyPairs.e.publicKey);
keyPairs.d.publicKey = arrToStr(keyPairs.f.publicKey);
var createOp, ops, ignored, unresolvedHashes, verifiedOps;

beforeAll(() => {
    createOp = unit.generateCreateOp(keyPairs["a"]);
});

// describe('getDeps', () => {
//     test("successfully gets deps for (create)", async () => {
//         const ops = [createOp];
//         const deps = unit.getDeps(ops);

//         expect(deps.length).toBe(1);
//         expect(deps[0]).toBe(unit.hashOp(createOp));
//     });

//     test("successfully gets deps for (create, add)", async () => {
//         const ops = [createOp];
//         const addB = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]);
//         ops.push(addB);
//         const deps = unit.getDeps(ops);

//         expect(deps.length).toBe(1);
//         expect(deps[0]).toBe(unit.hashOp(addB));
//     });

//     test("successfully gets deps for (create, add, add)", async () => {
//         const ops = [createOp];
//         const addB = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]);
//         ops.push(addB);
//         const addC = unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]);
//         ops.push(addC);
//         const deps = unit.getDeps(ops);

//         expect(deps.length).toBe(1);
//         expect(deps[0]).toBe(unit.hashOp(addC));
//     });

//     test("successfully gets deps for (create, add, conc(add, add))", async () => {
//         const ops = [createOp];
//         const addB = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]);
//         ops.push(addB);
//         const addC = unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["b"]);
//         const addD = unit.generateOp("add", keyPairs["d"].publicKey, ops, keyPairs["a"]);
//         ops.push(addC, addD);
//         const deps = unit.getDeps(ops);

//         expect(deps.length).toBe(2);
//         expect(deps).toContain(unit.hashOp(addC));
//         expect(deps).toContain(unit.hashOp(addD));
//     });

//     test("successfully gets deps for (create, add, conc(add, add), conc(remove, remove))", async () => {
//         const ops = [createOp];
//         const addB = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]);
//         ops.push(addB);
//         const addC = unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["b"]);
//         const addD = unit.generateOp("add", keyPairs["d"].publicKey, ops, keyPairs["a"]);
//         ops.push(addC, addD);
//         const remA = unit.generateOp("add", keyPairs["a"].publicKey, ops, keyPairs["c"]);
//         const remB = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["d"]);
//         ops.push(remA, remB);
//         const deps = unit.getDeps(ops);

//         expect(deps.length).toBe(2);
//         expect(deps).toContain(unit.hashOp(remA));
//         expect(deps).toContain(unit.hashOp(remB));
//     });
// });

// describe('verifiedOperations', () => {

//     beforeEach(() => {
//         ops = [createOp];
//         unresolvedHashes = new Map();
//         verifiedOps = [];
//     });

//     test("fails without create operation (but still adds)", async () => {
//         ops = [unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"])];
//         const verified = unit.verifiedOperations(ops, [createOp], unresolvedHashes, verifiedOps);

//         expect(verified).toBe(false);
//         expect(verifiedOps.length).toBe(2);
//         expect(unresolvedHashes.size).toBe(0);
//     });

//     test("fails due to multiple create operation (including false dep)", async () => {
//         ops.push(unit.generateCreateOp(keyPairs["b"]));
//         const addOp = unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["b"]);
//         ops.push(addOp);
//         const verified = unit.verifiedOperations(ops, [createOp], unresolvedHashes, verifiedOps);

//         expect(verified).toBe(false);
//         expect(verifiedOps.length).toBe(1);
//         expect(unresolvedHashes.size).toBe(1);
//     });

//     test("fails due to multiple create operation (but still adds)", async () => {
//         const createOpA = unit.generateCreateOp(keyPairs["a"]);
//         const createOpB = unit.generateCreateOp(keyPairs["b"]);
//         const ops = [createOpB];
//         const addOp = unit.generateOp("add", keyPairs["c"].publicKey, [createOpA], keyPairs["a"]);
//         ops.push(addOp);
//         const verified = unit.verifiedOperations(ops, [createOpA], unresolvedHashes, verifiedOps);

//         expect(verified).toBe(false);
//         expect(verifiedOps.length).toBe(2);
//         expect(unresolvedHashes.size).toBe(0);
//     });

//     test("fails due to multiple create operation (many in local)", async () => {
//         const createOp = unit.generateCreateOp(keyPairs["b"]);
//         ops.push(createOp);
//         const addOp = unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]);
//         ops.push(addOp);
//         const verified = unit.verifiedOperations(ops, [createOp, addOp], unresolvedHashes, verifiedOps);

//         expect(verified).toBe(false);
//         expect(verifiedOps.length).toBe(2);
//         expect(verifiedOps).toContain(createOp);
//         expect(unresolvedHashes.size).toBe(0);
//     });

//     test("fails due to incorrect key (create)", async () => {
//         const createOp = unit.generateCreateOp(keyPairs["a"]);
//         const createOpCopy = JSON.parse(JSON.stringify(createOp));
//         createOpCopy["sig"] = arrToStr(nacl.sign.detached(unit.enc.encode(unit.concatOp(createOp)), keyPairs["b"].secretKey));
//         const addB = unit.generateOp("add", keyPairs["b"].publicKey, [createOpCopy], keyPairs["a"]);
//         const verified = unit.verifiedOperations([createOpCopy, addB], [createOp], unresolvedHashes, verifiedOps);

//         expect(verified).toBe(false);
//         console.log(unit.hashOp(createOp));
//         console.log(unit.hashOp(createOp));
//         console.log(verifiedOps);
//         expect(verifiedOps.length).toBe(1);
//     });

//     test("fails due to incorrect key (but gains legit dep)", async () => {
//         const createOp = unit.generateCreateOp(keyPairs["a"]);
//         const createOpCopy = JSON.parse(JSON.stringify(createOp));
//         createOpCopy["sig"] = arrToStr(nacl.sign.detached(unit.enc.encode(unit.concatOp(createOp)), keyPairs["b"].secretKey));
//         const addB = unit.generateOp("add", keyPairs["b"].publicKey, [createOp], keyPairs["a"]);
//         const verified = unit.verifiedOperations([createOpCopy, addB], [createOp], unresolvedHashes, verifiedOps);

//         expect(verified).toBe(false);
//         expect(verifiedOps.length).toBe(2);
//     });

//     test("fails due to incorrect key (add)", async () => {
//         const addOp = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]);
//         addOp["sig"] = arrToStr(nacl.sign.detached(unit.enc.encode(unit.concatOp(addOp)), keyPairs["c"].secretKey));
//         ops.push(addOp);
//         const verified = unit.verifiedOperations(ops, [createOp], unresolvedHashes, verifiedOps);

//         expect(verified).toBe(false);
//         expect(verifiedOps.length).toBe(1);
//         expect(verifiedOps).toContain(createOp);
//     });

//     test("fails due to missing dependency", async () => {
//         const createOp = unit.generateCreateOp(keyPairs["a"]);
//         const ops = [createOp];
//         const addB = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"])
//         const addC = unit.generateOp("add", keyPairs["c"].publicKey, ops.concat([addB]), keyPairs["a"]);
//         const verified = unit.verifiedOperations([createOp, addC], ops, unresolvedHashes, verifiedOps);

//         expect(verified).toBe(false);
//         expect(unresolvedHashes.size).toBe(1);
//         expect(unresolvedHashes.has(addC.sig)).toEqual(true);
//         expect(verifiedOps.length).toBe(1);
//     });

//     test("passes and gains missing dependency (1)", async () => {
//         const addB = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"])
//         const addC = unit.generateOp("add", keyPairs["c"].publicKey, ops.concat([addB]), keyPairs["a"]);
//         ops.push(addC);
//         const verified = unit.verifiedOperations([createOp, addB], ops, unresolvedHashes, verifiedOps);

//         expect(verified).toBe(true);
//         expect(verifiedOps.length).toBe(3);
//         expect(verifiedOps).toContain(ops[0]); // createOp
//         expect(verifiedOps).toContain(addB);
//         expect(verifiedOps).toContain(addC);
//         expect(unresolvedHashes.size).toBe(0);
//     });

//     test("passes (non-empty local 1)", async () => {
//         ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
//         ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["b"]));
//         const addOp = unit.generateOp("add", keyPairs["d"].publicKey, ops, keyPairs["b"]);

//         const verified = unit.verifiedOperations([createOp, addOp], ops, unresolvedHashes, verifiedOps);

//         expect(verified).toBe(true);
//         expect(verifiedOps.length).toBe(4);
//         expect(verifiedOps).toContain(addOp);
//     });

//     test("passes (non-empty local 2)", async () => {
//         ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
//         ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["b"]));
//         const addOp = unit.generateOp("add", keyPairs["d"].publicKey, ops, keyPairs["b"]);
//         ops.push(unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["a"]));

//         const verified = unit.verifiedOperations([createOp, addOp], ops, unresolvedHashes, verifiedOps);

//         expect(verified).toBe(true);
//         expect(verifiedOps.length).toBe(5);
//         expect(verifiedOps).toContain(addOp);
//     });

//     test("passes (non-empty local 3)", async () => {
//         const createOp = unit.generateCreateOp(keyPairs["a"]);
//         ops = [createOp];
//         const ops2 = [createOp];
//         const addB = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]);
//         ops.push(addB);
//         ops2.push(addB);
//         const addC = unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["b"]);
//         ops2.push(addC);

//         const verified = unit.verifiedOperations(ops2, ops, unresolvedHashes, verifiedOps);

//         expect(verified).toBe(true);
//         expect(verifiedOps.length).toBe(3);
//         expect(verifiedOps).toContain(addC);
//     });
// });

// describe('hasCycles', () => {

//     function checkOpsMatch (concurrent, ops) {
//         const missing = ops.filter(op => !unit.hasOp(concurrent, op));
//         return missing.length == 0;
//     }

//     beforeEach(() => {
//         ops = [createOp];
//         ignored = [];
//         unit.hashedOps.clear();
//     });

//     test("correct when no cycles", async () => {
//         ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
//         ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]));
//         ops.push(unit.generateOp("add", keyPairs["d"].publicKey, ops, keyPairs["b"]));

//         ops.forEach((op) => {unit.hashedOps.set(unit.hashOp(op), op)});
//         const graphInfo = unit.hasCycles(ops);

//         expect(graphInfo.cycle).toBe(false);
//     });

//     test("correct when two conflict removal cycle", async () => {
//         ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
//         const concOps = [unit.generateOp("remove", keyPairs["b"].publicKey, ops, keyPairs["a"]), 
//                         unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["b"])];

//         ops = ops.concat(concOps);
//         ops.forEach((op) => {unit.hashedOps.set(unit.hashOp(op), op)});
//         const graphInfo = unit.hasCycles(ops);

//         expect(graphInfo.cycle).toBe(true);
//         expect(graphInfo.concurrent.length).toBe(1);
//         expect(checkOpsMatch(graphInfo.concurrent[0], concOps)).toBe(true);
//     });

//     test("correct when two conflict removal cycle with extra ops", async () => {
//         ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
//         const concOps = [unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]), 
//                         unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["b"])];
//         ops.push(unit.generateOp("remove", keyPairs["b"].publicKey, ops.concat(concOps[0]), keyPairs["c"]));

//         ops = ops.concat(concOps)
//         ops.forEach((op) => {unit.hashedOps.set(unit.hashOp(op), op)});
//         const graphInfo = unit.hasCycles(ops);

//         expect(graphInfo.cycle).toBe(true);
//         expect(graphInfo.concurrent.length).toBe(1);
//         expect(checkOpsMatch(graphInfo.concurrent[0], concOps)).toBe(true);
//     });

//     test("correct when three conflict removal cycle", async () => {
//         ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
//         ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]));
//         const concOps = [unit.generateOp("remove", keyPairs["b"].publicKey, ops, keyPairs["a"]),
//                         unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["b"]),
//                         unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["c"])];

//         ops = ops.concat(concOps)
//         ops.forEach((op) => {unit.hashedOps.set(unit.hashOp(op), op)});
//         const graphInfo = unit.hasCycles(ops);

//         expect(graphInfo.cycle).toBe(true);
//         expect(graphInfo.concurrent.length).toBe(1);
//         expect(checkOpsMatch(graphInfo.concurrent[0], concOps)).toBe(true);
//     });

//     test("correct when two removal cycles", async () => {
//         ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
//         ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]));
//         ops.push(unit.generateOp("add", keyPairs["d"].publicKey, ops, keyPairs["a"]));
//         const concOps1 = [unit.generateOp("remove", keyPairs["b"].publicKey, ops, keyPairs["a"]),
//                         unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["b"])];
//         const concOps2 = [unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["d"]),
//                         unit.generateOp("remove", keyPairs["d"].publicKey, ops, keyPairs["c"])];

//         ops = ops.concat(concOps1, concOps2)
//         ops.forEach((op) => {unit.hashedOps.set(unit.hashOp(op), op)});
//         const graphInfo = unit.hasCycles(ops);

//         expect(graphInfo.cycle).toBe(true);
//         expect(graphInfo.concurrent.length).toBe(2);
//         expect(checkOpsMatch(graphInfo.concurrent[0], concOps1) || checkOpsMatch(graphInfo.concurrent[0], concOps2)).toBe(true);
//         expect(checkOpsMatch(graphInfo.concurrent[1], concOps1) || checkOpsMatch(graphInfo.concurrent[1], concOps2)).toBe(true);
//     });
// });

// describe('members add', () => {

//     beforeEach(() => {
//         ops = [createOp];
//         ignored = [];
//     });

//     test("correct when sequentially adding devices", async () => {
//         ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
//         ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]));
//         ops.push(unit.generateOp("add", keyPairs["d"].publicKey, ops, keyPairs["b"]));

//         const members = await unit.members(ops, ignored);

//         expect(members.size).toBe(4);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["b"].publicKey);
//         expect(members).toContain(keyPairs["c"].publicKey);
//         expect(members).toContain(keyPairs["d"].publicKey);
//     });

    // test("correct when concurrently adding different devices", async () => {
    //     ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
    //     const concOp1 = await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops);
    //     const concOp2 = await unit.generateOp("add", keyPairs["b"], keyPairs["d"].publicKey, ops);

    //     const members = await unit.members(ops.concat(concOp1, concOp2), ignored);

    //     expect(members.size).toBe(4);
    //     expect(members).toContain(keyPairs["a"].publicKey);
    //     expect(members).toContain(keyPairs["b"].publicKey);
    //     expect(members).toContain(keyPairs["c"].publicKey);
    //     expect(members).toContain(keyPairs["d"].publicKey);
    // });

    // test("correct when concurrently adding the same device", async () => {
    //     ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
    //     const concOp1 = await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops);
    //     const concOp2 = await unit.generateOp("add", keyPairs["b"], keyPairs["c"].publicKey, ops);

    //     const members = await unit.members(ops.concat(concOp1, concOp2), ignored);

    //     expect(members.size).toBe(3);
    //     expect(members).toContain(keyPairs["a"].publicKey);
    //     expect(members).toContain(keyPairs["b"].publicKey);
    //     expect(members).toContain(keyPairs["c"].publicKey);
    // });

    // test("correct when concurrently adding and removing the same device", async () => {
    //     ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
    //     const concOp1a = await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops);
    //     const concOp1b = await unit.generateOp("remove", keyPairs["a"], keyPairs["c"].publicKey, ops.concat(concOp1a));
    //     const concOp2 = await unit.generateOp("add", keyPairs["b"], keyPairs["c"].publicKey, ops);

    //     const members = await unit.members(ops.concat(concOp1a, concOp1b, concOp2), ignored);
    //     expect(members.size).toBe(3);
    //     expect(members).toContain(keyPairs["a"].publicKey);
    //     expect(members).toContain(keyPairs["b"].publicKey);
    //     expect(members).toContain(keyPairs["c"].publicKey);
    // });
// });

// describe("member remove", () => {
//     var populatedOps;

//     beforeAll(() => {
//         return new Promise(async (resolve) => {
//             populatedOps = [await unit.generateOp("create", keyPairs["a"])];
//             populatedOps.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, populatedOps));
//             populatedOps.push(await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, populatedOps));
//             populatedOps.push(await unit.generateOp("add", keyPairs["b"], keyPairs["d"].publicKey, populatedOps));
//             resolve();
//         })
//     });

//     beforeEach(() => {
//         ops = [...populatedOps];
//         ignored = [];
//     });

//     test("correct when sequentially removing", async () => {
//         ops.push(await unit.generateOp("remove", keyPairs["c"], keyPairs["a"].publicKey, ops));
//         ops.push(await unit.generateOp("remove", keyPairs["d"], keyPairs["b"].publicKey, ops));
//         ops.push(await unit.generateOp("remove", keyPairs["c"], keyPairs["d"].publicKey, ops));

//         const members = await unit.members(ops, ignored);
//         expect(members.size).toBe(1);
//         expect(members).toContain(keyPairs["c"].publicKey);
//     });

//     test("correct when concurrently removing different devices", async () => {
//         const concOp1 = await unit.generateOp("remove", keyPairs["a"], keyPairs["c"].publicKey, ops);
//         const concOp2 = await unit.generateOp("remove", keyPairs["b"], keyPairs["d"].publicKey, ops);

//         const members = await unit.members(ops.concat(concOp1, concOp2), ignored);

//         expect(members.size).toBe(2);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["b"].publicKey);
//     });

//     test("correct when concurrently removing same device", async () => {
//         const concOp1 = await unit.generateOp("remove", keyPairs["a"], keyPairs["d"].publicKey, ops);
//         const concOp2 = await unit.generateOp("remove", keyPairs["b"], keyPairs["d"].publicKey, ops);

//         const members = await unit.members(ops.concat(concOp1, concOp2), ignored);

//         expect(members.size).toBe(3);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["b"].publicKey);
//         expect(members).toContain(keyPairs["c"].publicKey);
//     });

//     test("correct when removing after concurrent add", async () => {
//         ops = [createOp];
//         ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
//         const concOp1 = await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops);
//         const concOp2 = await unit.generateOp("add", keyPairs["b"], keyPairs["c"].publicKey, ops);
//         ops.push(concOp1, concOp2);
//         ops.push(await unit.generateOp("remove", keyPairs["a"], keyPairs["c"].publicKey, ops));

//         const members = await unit.members(ops, ignored);

//         expect(members.size).toBe(2);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["b"].publicKey);
//     });

//     test("correct when concurrently removing same device after concurrent add", async () => {
//         ops = [createOp];
//         ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
//         ops = ops.concat([await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops),
//                         await unit.generateOp("add", keyPairs["b"], keyPairs["c"].publicKey, ops)]);
//         ops = ops.concat([await unit.generateOp("remove", keyPairs["a"], keyPairs["c"].publicKey, ops),
//                         await unit.generateOp("remove", keyPairs["b"], keyPairs["c"].publicKey, ops)]);

//         const members = await unit.members(ops, ignored);

//         expect(members.size).toBe(2);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["b"].publicKey);
//     });
// });

// describe("member ignore", () => {
//     var populatedOps;

//     beforeAll(() => {
//         populatedOps = [unit.generateCreateOp(keyPairs["a"])];
//         populatedOps.push(unit.generateOp("add", keyPairs["b"].publicKey, populatedOps, keyPairs["a"]));
//         populatedOps.push(unit.generateOp("add", keyPairs["c"].publicKey, populatedOps, keyPairs["a"]));
//         populatedOps.push(unit.generateOp("add", keyPairs["d"].publicKey, populatedOps, keyPairs["b"]));
//     });

//     beforeEach(() => {
//         ops = [...populatedOps];
//         ignored = [];
//         unit.hashedOps.clear()
//     });

//     test("correct when ignoring member of two device removal cycle", async () => {
//         ignored.push(unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["b"]));
//         ops.push(unit.generateOp("remove", keyPairs["b"].publicKey, ops, keyPairs["a"]));
        
//         ops.forEach(op => unit.hashedOps.set(unit.hashOp(op), op));
//         const members = await unit.members(ops, ignored);

//         expect(members.size).toBe(3);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["c"].publicKey);
//         expect(members).toContain(keyPairs["d"].publicKey);
//     });

//     test("correct when ignoring member of two device removal cycle (I c O)", async () => {
//         const remA = unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["b"]);
//         ops.push(remA, unit.generateOp("remove", keyPairs["b"].publicKey, ops, keyPairs["a"]));
//         ignored.push(remA);
        
//         ops.forEach(op => unit.hashedOps.set(unit.hashOp(op), op));
//         const members = await unit.members(ops, ignored);

//         expect(members.size).toBe(3);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["c"].publicKey);
//         expect(members).toContain(keyPairs["d"].publicKey);
//     });

//     test("correct when ignoring member from two device removal cycle with extra ops", async () => {
//         // (a adds f, c removes b) and (b removes c), ignoring b removes c
//         const concOps = [unit.generateOp("add", keyPairs["f"].publicKey, ops, keyPairs["a"])];
//         concOps.push(unit.generateOp("remove", keyPairs["b"].publicKey, ops.concat(concOps), keyPairs["c"]));

//         const remOp = unit.generateOp("remove", keyPairs["c"].publicKey, ops.concat(concOps), keyPairs["b"]);
//         concOps.push(remOp);

//         ignored.push(remOp);

//         ops.push(...concOps);
//         ops.forEach(op => unit.hashedOps.set(unit.hashOp(op), op));
//         const members = await unit.members(ops, ignored);

//         expect(members.size).toBe(4);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["c"].publicKey);
//         expect(members).toContain(keyPairs["d"].publicKey);
//         expect(members).toContain(keyPairs["f"].publicKey);
//     });

//     test("correct when ignoring member of three device removal cycle", async () => {
//         ignored.push(unit.generateOp("remove", keyPairs["b"].publicKey, ops, keyPairs["a"]));
//         const concOps = [unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["b"]),
//                         unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["c"])];

//         ops.push(...concOps);
//         ops.forEach(op => unit.hashedOps.set(unit.hashOp(op), op));
//         const members = await unit.members(ops, ignored);

//         expect(members.size).toBe(3);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["b"].publicKey);
//         expect(members).toContain(keyPairs["d"].publicKey);
//     });

//     test("correct when two removal cycles", async () => {
//         const concOps = [unit.generateOp("remove", keyPairs["b"].publicKey, ops, keyPairs["a"]),
//                         unit.generateOp("remove", keyPairs["d"].publicKey, ops, keyPairs["c"])];
//         ignored.push(unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["d"]),
//                     unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["b"]));

//         ops.push(...concOps);
//         ops.forEach(op => unit.hashedOps.set(unit.hashOp(op), op));
//         const members = await unit.members(ops, ignored);

//         expect(members.size).toBe(2);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["c"].publicKey);
//     });

//     test("correct with non-direct removals cycles (1)", async () => {
//         // (a adds e, e removes c) and (c removes a) ignores (a adds e)
//         const concOps = [unit.generateOp("add", keyPairs["e"].publicKey, ops, keyPairs["a"]),
//                         unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["c"])];
//         ops.push(concOps[0]);
//         ops.push(unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["e"]));

//         ops.push(concOps[1]);
//         ignored.push(concOps[0]);

//         ops.forEach(op => unit.hashedOps.set(unit.hashOp(op), op));
//         const members = await unit.members(ops, ignored);

//         expect(members.size).toBe(3);
//         expect(members).toContain(keyPairs["b"].publicKey);
//         expect(members).toContain(keyPairs["c"].publicKey);
//         expect(members).toContain(keyPairs["d"].publicKey);
//     });

//     test("correct with non-direct removals cycles (2)", async () => {
//         // (a adds f, f adds e, e removes c) and (c removes a) ignores (a adds f)
//         const concOps = [unit.generateOp("add", keyPairs["f"].publicKey, ops, keyPairs["a"]),
//                         unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["c"])];
//         ops.push(concOps[0]);
//         ops.push(unit.generateOp("add", keyPairs["e"].publicKey, ops, keyPairs["f"]));
//         ops.push(unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["e"]));

//         ops.push(concOps[1]);
//         ignored.push(concOps[0]);

//         ops.forEach(op => unit.hashedOps.set(unit.hashOp(op), op));
//         const members = await unit.members(ops, ignored);

//         expect(members.size).toBe(3);
//         expect(members).toContain(keyPairs["b"].publicKey);
//         expect(members).toContain(keyPairs["c"].publicKey);
//         expect(members).toContain(keyPairs["d"].publicKey);
//     });

//     test("correct with non-direct removals cycles (2)", async () => {
//         // (a adds f, f adds e, e removes c) and (c removes a) ignores (c removes a)
//         const concOps = [unit.generateOp("add", keyPairs["f"].publicKey, ops, keyPairs["a"]),
//                         unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["c"])];
//         ops.push(concOps[0]);
//         ops.push(unit.generateOp("add", keyPairs["e"].publicKey, ops, keyPairs["f"]));
//         ops.push(unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["e"]));

//         ops.push(concOps[1]);
//         ignored.push(concOps[1]);

//         ops.forEach(op => unit.hashedOps.set(unit.hashOp(op), op));
//         const members = unit.members(ops, ignored);

//         expect(members.size).toBe(5);
//         expect(members).toContain(keyPairs["b"].publicKey);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["d"].publicKey);
//         expect(members).toContain(keyPairs["e"].publicKey);
//         expect(members).toContain(keyPairs["f"].publicKey);
//     });
// });

describe("earliest subset", () => {
    var populatedOps;

    beforeAll(() => {
        populatedOps = [unit.generateCreateOp(keyPairs["a"])];
        populatedOps.push(unit.generateOp("add", keyPairs["b"].publicKey, populatedOps, keyPairs["a"]));
        populatedOps.push(unit.generateOp("add", keyPairs["c"].publicKey, populatedOps, keyPairs["a"]));
        populatedOps.push(unit.generateOp("add", keyPairs["d"].publicKey, populatedOps, keyPairs["b"]));
    });

    beforeEach(() => {
        ops = [...populatedOps];
        ignored = [];
        unit.hashedOps.clear()
    });

    test("correct when ignoring member of two device removal cycle (I c O)", async () => {
        const remA = unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["b"]);
        const remB = unit.generateOp("remove", keyPairs["b"].publicKey, ops, keyPairs["a"]);
        ops.push(remA, remB);
        
        ops.forEach(op => unit.hashedOps.set(unit.hashOp(op), op));
        const cycle = unit.hasCycles(ops).concurrent[0];
        const options = unit.earliestSubset(cycle);

        expect(options.length).toBe(2);
        expect(options).toContain(remA);
        expect(options).toContain(remB);
    });


    test("correct when ignoring member of three device removal cycle", async () => {
        const concOps = [unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["b"]),
                        unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["c"]),
                        unit.generateOp("remove", keyPairs["b"].publicKey, ops, keyPairs["a"])];

        ops.push(...concOps);

        ops.forEach(op => unit.hashedOps.set(unit.hashOp(op), op));
        const cycle = unit.hasCycles(ops).concurrent[0];
        const options = unit.earliestSubset(cycle);

        expect(options.length).toBe(3);
        expect(options).toContain(concOps[0]);
        expect(options).toContain(concOps[1]);
        expect(options).toContain(concOps[2]);
    });

    test("correct with non-direct removals cycles (1)", async () => {
        // (a adds e, e removes c) and (c removes a) ignores (a adds e)
        const concOps = [unit.generateOp("add", keyPairs["e"].publicKey, ops, keyPairs["a"]),
                        unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["c"])];
        ops.push(concOps[0]);
        ops.push(unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["e"]));

        ops.push(concOps[1]);

        ops.forEach(op => unit.hashedOps.set(unit.hashOp(op), op));
        const cycle = unit.hasCycles(ops).concurrent[0];
        const options = unit.earliestSubset(cycle);

        expect(options.length).toBe(2);
        expect(options).toContain(concOps[0]);
        expect(options).toContain(concOps[1]);
    });
    
    test("correct with non-direct removals cycles (2)", async () => {
        // (a adds f, f adds e, e removes c) and (c removes a) ignores (c removes a)
        const concOps = [unit.generateOp("add", keyPairs["f"].publicKey, ops, keyPairs["a"]),
                        unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["c"])];
        ops.push(concOps[0]);
        ops.push(unit.generateOp("add", keyPairs["e"].publicKey, ops, keyPairs["f"]));
        ops.push(unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["e"]));

        ops.push(concOps[1]);

        ops.forEach(op => unit.hashedOps.set(unit.hashOp(op), op));
        const cycle = unit.hasCycles(ops).concurrent[0];
        const options = unit.earliestSubset(cycle);

        expect(options.length).toBe(2);
        expect(options).toContain(concOps[0]);
        expect(options).toContain(concOps[1]);
    });
});
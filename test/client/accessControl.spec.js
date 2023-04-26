import * as unit from '../../src/client/accessControl.js';
import * as nacl from '../../node_modules/tweetnacl/nacl-fast.js';
import { arrToStr } from '../../src/client/utils.js';
import { expect, test, describe, beforeAll, beforeEach } from '@jest/globals';

const keyPairs = {
    "a": nacl.sign.keyPair(),
    "b": nacl.sign.keyPair(),
    "c": nacl.sign.keyPair(),
    "d": nacl.sign.keyPair(),
}
keyPairs.a.publicKey = arrToStr(keyPairs.a.publicKey);
keyPairs.b.publicKey = arrToStr(keyPairs.b.publicKey);
keyPairs.c.publicKey = arrToStr(keyPairs.c.publicKey);
keyPairs.d.publicKey = arrToStr(keyPairs.d.publicKey);
var createOp, ops, ignored;

beforeAll(() => {
    createOp = unit.generateCreateOp(keyPairs["a"]);
});

describe('verifiedOperations', () => {

    beforeEach(() => {
        ops = [createOp];
    });

    test("fails without create operation", async () => {

        ops = [unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"])];
        const unresolvedHashes = [];
        const verifiedOps = unit.verifiedOperations(ops, [], unresolvedHashes);
        expect(verifiedOps.length).toBe(0);
        expect(unresolvedHashes.length).toBe(1);
    });

    test("fails due to multiple create operation (empty local)", async () => {
        const createOp = unit.generateCreateOp(keyPairs["b"]);
        ops.push(createOp);
        const addOp = unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]);
        ops.push(addOp);
        const verifiedOps = unit.verifiedOperations(ops, [], []);

        expect(verifiedOps.length).toBe(0);
    });

    test("fails due to multiple create operation (non-empty local)", async () => {
        const createOp = unit.generateCreateOp(keyPairs["b"]);
        ops.push(createOp);
        const addOp = unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]);
        ops.push(addOp);
        const verifiedOps = unit.verifiedOperations(ops, [createOp], []);

        expect(verifiedOps.length).toBe(1);
        expect(verifiedOps).toContain(createOp);
    });

    test("fails due to incorrect key (create)", async () => {
        const createOp = unit.generateCreateOp(keyPairs["a"]);
        ops = [createOp];
        createOp["sig"] = arrToStr(nacl.sign.detached(unit.enc.encode(unit.concatOp(createOp)), keyPairs["b"].secretKey));
        ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
        const verifiedOps = unit.verifiedOperations(ops, [], []);

        expect(verifiedOps.length).toBe(0);
    });

    test("fails due to incorrect key (add, empty local)", async () => {
        const createOp = unit.generateCreateOp(keyPairs["a"]);
        ops = [createOp];
        const addOp = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]);
        ops.push(addOp);
        addOp["sig"] = arrToStr(nacl.sign.detached(unit.enc.encode(unit.concatOp(createOp)), keyPairs["c"].secretKey));
        const verifiedOps = unit.verifiedOperations(ops, [], []);

        expect(verifiedOps.length).toBe(1);
        expect(verifiedOps).toContain(createOp);
    });

    test("fails due to incorrect key (add, non-empty local)", async () => {
        const createOp = unit.generateCreateOp(keyPairs["a"]);
        ops = [createOp];
        const addOp = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]);
        ops.push(addOp);
        addOp["sig"] = arrToStr(nacl.sign.detached(unit.enc.encode(unit.concatOp(addOp)), keyPairs["c"].secretKey));
        const verifiedOps = unit.verifiedOperations(ops, [createOp], []);
        console.log(verifiedOps);

        expect(verifiedOps.length).toBe(1);
        expect(verifiedOps).toContain(createOp);
    });

    test("fails due to missing dependency", async () => {
        const addB = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"])
        const addC = unit.generateOp("add", keyPairs["c"].publicKey, ops.concat([addB]), keyPairs["a"]);
        ops.push(addC);
        const unresolvedHashes = [];
        const verifiedOps = unit.verifiedOperations(ops, [], unresolvedHashes);

        expect(verifiedOps.length).toBe(1);
        expect(verifiedOps).toContain(ops[0]); // createOp
        expect(unresolvedHashes.length).toBe(1);
        expect(unresolvedHashes[0].op).toEqual(addC);
    });

    test("gains missing dependency (1)", async () => {
        const addB = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"])
        const addC = unit.generateOp("add", keyPairs["c"].publicKey, ops.concat([addB]), keyPairs["a"]);
        ops.push(addC);
        const unresolvedHashes = [];
        const verifiedOps = unit.verifiedOperations([addB], ops, unresolvedHashes);

        expect(verifiedOps.length).toBe(3);
        expect(verifiedOps).toContain(ops[0]); // createOp
        expect(verifiedOps).toContain(addB);
        expect(verifiedOps).toContain(addC);
        expect(unresolvedHashes.length).toBe(0);
    });

    test("passes (empty local 1)", async () => {
        ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
        ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["b"]));

        const verifiedOps = unit.verifiedOperations(ops, [], []);

        expect(verifiedOps.length).toBe(3);
    });

    test("passes (non-empty local 1)", async () => {
        ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
        ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["b"]));
        const addOp = unit.generateOp("add", keyPairs["d"].publicKey, ops, keyPairs["b"]);

        const verifiedOps = unit.verifiedOperations([addOp], ops, []);

        expect(verifiedOps.length).toBe(4);
        expect(verifiedOps).toContain(addOp);
    });

    test("passes (non-empty local 2)", async () => {
        ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
        ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["b"]));
        const addOp = unit.generateOp("add", keyPairs["d"].publicKey, ops, keyPairs["b"]);
        ops.push(unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["a"]));

        const verifiedOps = unit.verifiedOperations([addOp], ops, []);

        expect(verifiedOps.length).toBe(5);
        expect(verifiedOps).toContain(addOp);
    });

    test("passes (non-empty local 2)", async () => {
        const createOp = unit.generateCreateOp(keyPairs["a"]);
        ops = [createOp];
        const ops2 = [createOp];
        const addB = unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]);
        ops.push(addB);
        ops2.push(addB);
        const addC = unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["b"]);
        ops2.push(addC);

        const verifiedOps = unit.verifiedOperations(ops2, ops, []);

        expect(verifiedOps.length).toBe(3);
        expect(verifiedOps).toContain(addC);
    });
});

describe('hasCycles', () => {

    function checkOpsMatch (concurrent, ops) {
        const missing = ops.filter(op => !unit.hasOp(concurrent, op));
        return missing.length == 0;
    }

    beforeEach(() => {
        ops = [createOp];
        ignored = [];
        unit.hashedOps.clear();
    });

    test("correct when no cycles", async () => {
        ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
        ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]));
        ops.push(unit.generateOp("add", keyPairs["d"].publicKey, ops, keyPairs["b"]));

        ops.forEach((op) => {unit.hashedOps.set(unit.hashOp(op), op)});
        const graphInfo = unit.hasCycles(ops);

        expect(graphInfo.cycle).toBe(false);
    });

    test("correct when two conflict removal cycle", async () => {
        ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
        const concOps = [unit.generateOp("remove", keyPairs["b"].publicKey, ops, keyPairs["a"]), 
                        unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["b"])];

        ops = ops.concat(concOps);
        console.log(JSON.stringify(ops));
        ops.forEach((op) => {unit.hashedOps.set(unit.hashOp(op), op)});
        const graphInfo = unit.hasCycles(ops);

        expect(graphInfo.cycle).toBe(true);
        expect(graphInfo.concurrent.length).toBe(1);
        expect(checkOpsMatch(graphInfo.concurrent[0], concOps)).toBe(true);
    });

    test("correct when two conflict removal cycle with extra ops", async () => {
        ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
        const concOps = [unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]), 
                        unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["b"])];
        ops.push(unit.generateOp("remove", keyPairs["b"].publicKey, ops.concat(concOps[0]), keyPairs["c"]));

        ops = ops.concat(concOps)
        ops.forEach((op) => {unit.hashedOps.set(unit.hashOp(op), op)});
        const graphInfo = unit.hasCycles(ops);

        expect(graphInfo.cycle).toBe(true);
        expect(graphInfo.concurrent.length).toBe(1);
        expect(checkOpsMatch(graphInfo.concurrent[0], concOps)).toBe(true);
    });

    test("correct when three conflict removal cycle", async () => {
        ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
        ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]));
        const concOps = [unit.generateOp("remove", keyPairs["b"].publicKey, ops, keyPairs["a"]),
                        unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["b"]),
                        unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["c"])];

        ops = ops.concat(concOps)
        ops.forEach((op) => {unit.hashedOps.set(unit.hashOp(op), op)});
        const graphInfo = unit.hasCycles(ops);

        expect(graphInfo.cycle).toBe(true);
        expect(graphInfo.concurrent.length).toBe(1);
        expect(checkOpsMatch(graphInfo.concurrent[0], concOps)).toBe(true);
    });

    test("correct when two removal cycles", async () => {
        ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
        ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]));
        ops.push(unit.generateOp("add", keyPairs["d"].publicKey, ops, keyPairs["a"]));
        const concOps1 = [unit.generateOp("remove", keyPairs["b"].publicKey, ops, keyPairs["a"]),
                        unit.generateOp("remove", keyPairs["a"].publicKey, ops, keyPairs["b"])];
        const concOps2 = [unit.generateOp("remove", keyPairs["c"].publicKey, ops, keyPairs["d"]),
                        unit.generateOp("remove", keyPairs["d"].publicKey, ops, keyPairs["c"])];

        ops = ops.concat(concOps1, concOps2)
        ops.forEach((op) => {unit.hashedOps.set(unit.hashOp(op), op)});
        const graphInfo = unit.hasCycles(ops);

        expect(graphInfo.cycle).toBe(true);
        expect(graphInfo.concurrent.length).toBe(2);
        expect(checkOpsMatch(graphInfo.concurrent[0], concOps1) || checkOpsMatch(graphInfo.concurrent[0], concOps2)).toBe(true);
        expect(checkOpsMatch(graphInfo.concurrent[1], concOps1) || checkOpsMatch(graphInfo.concurrent[1], concOps2)).toBe(true);
    });
});

describe('members add', () => {

    beforeEach(() => {
        ops = [createOp];
        ignored = [];
    });

    test("correct when sequentially adding devices", async () => {
        ops.push(unit.generateOp("add", keyPairs["b"].publicKey, ops, keyPairs["a"]));
        ops.push(unit.generateOp("add", keyPairs["c"].publicKey, ops, keyPairs["a"]));
        ops.push(unit.generateOp("add", keyPairs["d"].publicKey, ops, keyPairs["b"]));

        const members = await unit.members(ops, ignored);

        expect(members.size).toBe(4);
        expect(members).toContain(keyPairs["a"].publicKey);
        expect(members).toContain(keyPairs["b"].publicKey);
        expect(members).toContain(keyPairs["c"].publicKey);
        expect(members).toContain(keyPairs["d"].publicKey);
    });

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
});

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
//         return new Promise(async (resolve) => {
//             populatedOps = [await unit.generateOp("create", keyPairs["a"])];
//             populatedOps.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, populatedOps));
//             populatedOps.push(await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, populatedOps));
//             resolve();
//         })
//     });

//     beforeEach(() => {
//         ops = [...populatedOps];
//         ignored = [];
//     });

//     test("correct when ignoring member of two device removal cycle", async () => {
//         ignored.push(await unit.generateOp("remove", keyPairs["b"], keyPairs["a"].publicKey, ops));
//         ops.push(await unit.generateOp("remove", keyPairs["a"], keyPairs["b"].publicKey, ops));
        
//         const members = await unit.members(ops, ignored);

//         expect(members.size).toBe(2);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["c"].publicKey);
//     });

//     test("correct when ignoring member from two device removal cycle with extra ops", async () => {
//         const concOps = [await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops)];
//         concOps.push(await unit.generateOp("remove", keyPairs["c"], keyPairs["b"].publicKey, ops.concat(concOps[0])));

//         ignored.push(await unit.generateOp("remove", keyPairs["b"], keyPairs["a"].publicKey, ops));

//         const members = await unit.members(ops.concat(concOps), ignored);

//         expect(members.size).toBe(2);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["c"].publicKey);
//     });

//     test("correct when ignoring member of three device removal cycle", async () => {
//         ignored.push(await unit.generateOp("remove", keyPairs["a"], keyPairs["b"].publicKey, ops));
//         const concOps = [await unit.generateOp("remove", keyPairs["b"], keyPairs["c"].publicKey, ops),
//                         await unit.generateOp("remove", keyPairs["c"], keyPairs["a"].publicKey, ops)];

//         const members = await unit.members(ops.concat(concOps), ignored);

//         console.log(members);
//         expect(members.size).toBe(2);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["b"].publicKey);
//     });

//     test("correct when two removal cycles", async () => {
//         ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["d"].publicKey, ops));
//         const concOps = [ await unit.generateOp("remove", keyPairs["a"], keyPairs["b"].publicKey, ops),
//                         await unit.generateOp("remove", keyPairs["c"], keyPairs["d"].publicKey, ops)];
//         ignored.push(await unit.generateOp("remove", keyPairs["d"], keyPairs["c"].publicKey, ops),
//                     await unit.generateOp("remove", keyPairs["b"], keyPairs["a"].publicKey, ops));

//         const members = await unit.members(ops.concat(concOps), ignored);

//         console.log(members);
//         expect(members.size).toBe(2);
//         expect(members).toContain(keyPairs["a"].publicKey);
//         expect(members).toContain(keyPairs["c"].publicKey);
//     });
// });
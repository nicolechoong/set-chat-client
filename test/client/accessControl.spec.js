import * as unit from '../../src/client/accessControl.js';
import * as nacl from '../../node_modules/tweetnacl/nacl-fast.js';
import { expect, test, describe, beforeAll, beforeEach } from '@jest/globals';

const keyPairs = {
    "a": nacl.sign.keyPair(),
    "b": nacl.sign.keyPair(),
    "c": nacl.sign.keyPair(),
    "d": nacl.sign.keyPair(),
}
var createOp, ops, ignored;

beforeAll(() => {
    return new Promise(async (resolve) => {
        createOp = await unit.generateOp("create", keyPairs["a"]);
        resolve();
    })
});

// describe('verifyOperations', () => {

//     beforeEach(() => {
//         ops = [createOp];
//     });

//     test("fails without create operation", async () => {

//         ops = [await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops)];

//         expect(unit.verifyOperations(ops)).toBe(false);
//     });

//     test("fails without multiple create operation", async () => {
//         ops.push(await unit.generateOp("create", keyPairs["b"]));
//         ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops));

//         expect(unit.verifyOperations(ops)).toBe(false);
//     });

//     test("fails due to incorrect key", async () => {
//         ops = [await unit.generateOp("create", keyPairs["a"])];
//         ops[0]["sig"] = nacl.sign.detached(unit.enc.encode(`create${ops[0].pk}${ops[0].nonce}`), keyPairs["b"].secretKey);
//         ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));

//         expect(unit.verifyOperations(ops)).toBe(false);
//     });

//     test("fails due to missing dependency", async () => {
//         const addB = await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops);
//         ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops.concat([addB])));

//         expect(unit.verifyOperations(ops)).toBe(false);
//     });

//     test("passes", async () => {
//         ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
//         ops.push(await unit.generateOp("add", keyPairs["b"], keyPairs["c"].publicKey, ops));

//         expect(unit.verifyOperations(ops)).toBe(true);
//     });
// });

describe('hasCycles', () => {

    function checkOpsMatch (concurrent, ops) {
        const missing = ops.filter(op => !unit.hasOp(concurrent, op));
        return missing.length == 0;
    }

    beforeEach(() => {
        ops = [createOp];
        ignored = [];
    });

    test("correct when no cycles", async () => {
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops));
        ops.push(await unit.generateOp("add", keyPairs["b"], keyPairs["d"].publicKey, ops));

        const graphInfo = unit.hasCycles(ops);

        expect(graphInfo.cycle).toBe(false);
    });

    test("correct when two conflict removal cycle", async () => {
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
        const concOps = [ await unit.generateOp("remove", keyPairs["a"], keyPairs["b"].publicKey, ops), 
                        await unit.generateOp("remove", keyPairs["b"], keyPairs["a"].publicKey, ops)];

        const graphInfo = unit.hasCycles(ops.concat(concOps));

        expect(graphInfo.cycle).toBe(true);
        expect(graphInfo.concurrent.length).toBe(1);
        expect(checkOpsMatch(graphInfo.concurrent[0], concOps)).toBe(true);
    });

    test("correct when two conflict removal cycle with extra ops", async () => {
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
        const concOps = [ await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops), 
                        await unit.generateOp("remove", keyPairs["b"], keyPairs["a"].publicKey, ops)];
        ops.push(await unit.generateOp("remove", keyPairs["c"], keyPairs["b"].publicKey, ops.concat(concOps[0])));

        const graphInfo = unit.hasCycles(ops.concat(concOps));

        expect(graphInfo.cycle).toBe(true);
        expect(graphInfo.concurrent.length).toBe(1);
        expect(checkOpsMatch(graphInfo.concurrent[0], concOps)).toBe(true);
    });

    test("correct when three conflict removal cycle", async () => {
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops));
        const concOps = [ await unit.generateOp("remove", keyPairs["a"], keyPairs["b"].publicKey, ops),
                        await unit.generateOp("remove", keyPairs["b"], keyPairs["c"].publicKey, ops),
                        await unit.generateOp("remove", keyPairs["c"], keyPairs["a"].publicKey, ops)];

        const graphInfo = unit.hasCycles(ops.concat(concOps));

        expect(graphInfo.cycle).toBe(true);
        expect(graphInfo.concurrent.length).toBe(1);
        expect(checkOpsMatch(graphInfo.concurrent[0], concOps)).toBe(true);
    });

    test("correct when two removal cycles", async () => {
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops));
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["d"].publicKey, ops));
        const concOps1 = [ await unit.generateOp("remove", keyPairs["a"], keyPairs["b"].publicKey, ops),
                        await unit.generateOp("remove", keyPairs["b"], keyPairs["a"].publicKey, ops)];
        const concOps2 = [ await unit.generateOp("remove", keyPairs["d"], keyPairs["c"].publicKey, ops),
                        await unit.generateOp("remove", keyPairs["c"], keyPairs["d"].publicKey, ops)];

        const graphInfo = unit.hasCycles(ops.concat(concOps1, concOps2));

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
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops));
        ops.push(await unit.generateOp("add", keyPairs["b"], keyPairs["d"].publicKey, ops));

        const members = await unit.members(ops, ignored);

        expect(members.size).toBe(4);
        expect(members).toContain(JSON.stringify(keyPairs["a"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["b"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["c"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["d"].publicKey));
    });

    test("correct when concurrently adding different devices", async () => {
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
        const concOp1 = await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops);
        const concOp2 = await unit.generateOp("add", keyPairs["b"], keyPairs["d"].publicKey, ops);

        const members = await unit.members(ops.concat(concOp1, concOp2), ignored);

        expect(members.size).toBe(4);
        expect(members).toContain(JSON.stringify(keyPairs["a"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["b"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["c"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["d"].publicKey));
    });

    test("correct when concurrently adding the same device", async () => {
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
        const concOp1 = await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops);
        const concOp2 = await unit.generateOp("add", keyPairs["b"], keyPairs["c"].publicKey, ops);

        const members = await unit.members(ops.concat(concOp1, concOp2), ignored);

        expect(members.size).toBe(3);
        expect(members).toContain(JSON.stringify(keyPairs["a"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["b"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["c"].publicKey));
    });

    test("correct when concurrently adding and removing the same device", async () => {
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
        const concOp1a = await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops);
        const concOp1b = await unit.generateOp("remove", keyPairs["a"], keyPairs["c"].publicKey, ops.concat(concOp1a));
        const concOp2 = await unit.generateOp("add", keyPairs["b"], keyPairs["c"].publicKey, ops);

        const members = await unit.members(ops.concat(concOp1a, concOp1b, concOp2), ignored);
        expect(members.size).toBe(3);
        expect(members).toContain(JSON.stringify(keyPairs["a"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["b"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["c"].publicKey));
    });
});

describe("member remove", () => {
    var populatedOps;

    beforeAll(() => {
        return new Promise(async (resolve) => {
            populatedOps = [await unit.generateOp("create", keyPairs["a"])];
            populatedOps.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, populatedOps));
            populatedOps.push(await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, populatedOps));
            populatedOps.push(await unit.generateOp("add", keyPairs["b"], keyPairs["d"].publicKey, populatedOps));
            resolve();
        })
    });

    beforeEach(() => {
        ops = [...populatedOps];
        ignored = [];
    });

    test("correct when sequentially removing", async () => {
        ops.push(await unit.generateOp("remove", keyPairs["c"], keyPairs["a"].publicKey, ops));
        ops.push(await unit.generateOp("remove", keyPairs["d"], keyPairs["b"].publicKey, ops));
        ops.push(await unit.generateOp("remove", keyPairs["c"], keyPairs["d"].publicKey, ops));

        const members = await unit.members(ops, ignored);
        expect(members.size).toBe(1);
        expect(members).toContain(JSON.stringify(keyPairs["c"].publicKey));
    });

    test("correct when concurrently removing different devices", async () => {
        const concOp1 = await unit.generateOp("remove", keyPairs["a"], keyPairs["c"].publicKey, ops);
        const concOp2 = await unit.generateOp("remove", keyPairs["b"], keyPairs["d"].publicKey, ops);

        const members = await unit.members(ops.concat(concOp1, concOp2), ignored);

        expect(members.size).toBe(2);
        expect(members).toContain(JSON.stringify(keyPairs["a"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["b"].publicKey));
    });

    test("correct when concurrently removing same device", async () => {
        const concOp1 = await unit.generateOp("remove", keyPairs["a"], keyPairs["d"].publicKey, ops);
        const concOp2 = await unit.generateOp("remove", keyPairs["b"], keyPairs["d"].publicKey, ops);

        const members = await unit.members(ops.concat(concOp1, concOp2), ignored);

        expect(members.size).toBe(3);
        expect(members).toContain(JSON.stringify(keyPairs["a"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["b"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["c"].publicKey));
    });

    test("correct when removing after concurrent add", async () => {
        ops = [createOp];
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
        const concOp1 = await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops);
        const concOp2 = await unit.generateOp("add", keyPairs["b"], keyPairs["c"].publicKey, ops);
        ops.push(concOp1, concOp2);
        ops.push(await unit.generateOp("remove", keyPairs["a"], keyPairs["c"].publicKey, ops));

        const members = await unit.members(ops, ignored);

        expect(members.size).toBe(2);
        expect(members).toContain(JSON.stringify(keyPairs["a"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["b"].publicKey));
    });

    test("correct when concurrently removing same device after concurrent add", async () => {
        ops = [createOp];
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, ops));
        ops = ops.concat([await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops),
                        await unit.generateOp("add", keyPairs["b"], keyPairs["c"].publicKey, ops)]);
        ops = ops.concat([await unit.generateOp("remove", keyPairs["a"], keyPairs["c"].publicKey, ops),
                        await unit.generateOp("remove", keyPairs["b"], keyPairs["c"].publicKey, ops)]);

        const members = await unit.members(ops, ignored);

        expect(members.size).toBe(2);
        expect(members).toContain(JSON.stringify(keyPairs["a"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["b"].publicKey));
    });
});

describe("member ignore", () => {
    var populatedOps;

    beforeAll(() => {
        return new Promise(async (resolve) => {
            populatedOps = [await unit.generateOp("create", keyPairs["a"])];
            populatedOps.push(await unit.generateOp("add", keyPairs["a"], keyPairs["b"].publicKey, populatedOps));
            populatedOps.push(await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, populatedOps));
            resolve();
        })
    });

    beforeEach(() => {
        ops = [...populatedOps];
        ignored = [];
    });

    test("correct when ignoring member of two device removal cycle", async () => {
        ignored.push(await unit.generateOp("remove", keyPairs["b"], keyPairs["a"].publicKey, ops));
        ops.push(await unit.generateOp("remove", keyPairs["a"], keyPairs["b"].publicKey, ops));
        
        const members = await unit.members(ops, ignored);

        expect(members.size).toBe(2);
        expect(members).toContain(JSON.stringify(keyPairs["a"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["c"].publicKey));
    });

    test("correct when ignoring member from two device removal cycle with extra ops", async () => {
        const concOps = [await unit.generateOp("add", keyPairs["a"], keyPairs["c"].publicKey, ops)];
        concOps.push(await unit.generateOp("remove", keyPairs["c"], keyPairs["b"].publicKey, ops.concat(concOps[0])));

        ignored.push(await unit.generateOp("remove", keyPairs["b"], keyPairs["a"].publicKey, ops));

        const members = await unit.members(ops.concat(concOps), ignored);

        expect(members.size).toBe(2);
        expect(members).toContain(JSON.stringify(keyPairs["a"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["c"].publicKey));
    });

    test("correct when ignoring member of three device removal cycle", async () => {
        ignored.push(await unit.generateOp("remove", keyPairs["a"], keyPairs["b"].publicKey, ops));
        const concOps = [await unit.generateOp("remove", keyPairs["b"], keyPairs["c"].publicKey, ops),
                        await unit.generateOp("remove", keyPairs["c"], keyPairs["a"].publicKey, ops)];

        const members = await unit.members(ops.concat(concOps), ignored);

        console.log(members);
        expect(members.size).toBe(2);
        expect(members).toContain(JSON.stringify(keyPairs["a"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["b"].publicKey));
    });

    test("correct when two removal cycles", async () => {
        ops.push(await unit.generateOp("add", keyPairs["a"], keyPairs["d"].publicKey, ops));
        const concOps = [ await unit.generateOp("remove", keyPairs["a"], keyPairs["b"].publicKey, ops),
                        await unit.generateOp("remove", keyPairs["c"], keyPairs["d"].publicKey, ops)];
        ignored.push(await unit.generateOp("remove", keyPairs["d"], keyPairs["c"].publicKey, ops),
                    await unit.generateOp("remove", keyPairs["b"], keyPairs["a"].publicKey, ops));

        const members = await unit.members(ops.concat(concOps), ignored);

        console.log(members);
        expect(members.size).toBe(2);
        expect(members).toContain(JSON.stringify(keyPairs["a"].publicKey));
        expect(members).toContain(JSON.stringify(keyPairs["c"].publicKey));
    });
});
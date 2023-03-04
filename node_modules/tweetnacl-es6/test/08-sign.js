import nacl from './../nacl-fast-es.js';
import test from './helpers/tap-esm.js';
import specVectors from './data/sign.spec.js';
import util from './helpers/nacl-util.js'

test('nacl.sign and nacl.sign.open specified vectors', function(t) {
  specVectors.forEach(function(vec) {
    var keys = nacl.sign.keyPair.fromSecretKey(util.decodeBase64(vec[0]));
    var msg = util.decodeBase64(vec[1]);
    var goodSig = util.decodeBase64(vec[2]);

    var signedMsg = nacl.sign(msg, keys.secretKey);
    t.equal(util.encodeBase64(signedMsg.subarray(0, nacl.sign.signatureLength)), util.encodeBase64(goodSig), 'signatures must be equal');
    var openedMsg = nacl.sign.open(signedMsg, keys.publicKey);
    t.equal(util.encodeBase64(openedMsg), util.encodeBase64(msg), 'messages must be equal');
  });
  t.end();
});

test('nacl.sign.detached and nacl.sign.detached.verify some specified vectors', function(t) {
  specVectors.forEach(function(vec, i) {
    // We don't need to test all, as internals are already tested above.
    if (i % 100 !== 0) return;

    var keys = nacl.sign.keyPair.fromSecretKey(util.decodeBase64(vec[0]));
    var msg = util.decodeBase64(vec[1]);
    var goodSig = util.decodeBase64(vec[2]);

    var sig = nacl.sign.detached(msg, keys.secretKey);
    t.equal(util.encodeBase64(sig), util.encodeBase64(goodSig), 'signatures must be equal');
    var result = nacl.sign.detached.verify(msg, sig, keys.publicKey);
    t.ok(result, 'signature must be verified');
  });
  t.end();
});

import nacl from './../nacl-fast-es.js';
import test from './helpers/tap-esm.js';
import specVectors from './data/onetimeauth.spec.js';
import util from './helpers/nacl-util.js'

test('nacl.lowlevel.crypto_onetimeauth specified vectors', function (t) {
  var out = new Uint8Array(16);
  specVectors.forEach(function (v) {
    nacl.lowlevel.crypto_onetimeauth(out, 0, v.m, 0, v.m.length, v.k);
    t.equal(util.encodeBase64(out), util.encodeBase64(v.out));
  });
  t.end();
});

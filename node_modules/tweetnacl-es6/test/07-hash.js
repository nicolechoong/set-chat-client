import nacl from './../nacl-fast-es.js';
import test from './helpers/tap-esm.js';
import randomVectors from './data/hash.random.js';
import util from './helpers/nacl-util.js'

test('nacl.hash random test vectors', function(t) {
  randomVectors.forEach(function(vec) {
    var msg = util.decodeBase64(vec[0]);
    var goodHash = util.decodeBase64(vec[1]);
    var hash = nacl.hash(msg);
    t.equal(util.encodeBase64(hash), util.encodeBase64(goodHash));
  });
  t.end();
});

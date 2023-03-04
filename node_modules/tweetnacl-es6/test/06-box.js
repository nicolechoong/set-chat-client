import nacl from './../nacl-fast-es.js';
import test from './helpers/tap-esm.js';
import randomVectors from './data/box.random.js';
import util from './helpers/nacl-util.js'

test('nacl.box random test vectors', function(t) {
  var nonce = new Uint8Array(nacl.box.nonceLength);
  randomVectors.forEach(function(vec) {
    var pk1 = util.decodeBase64(vec[0]);
    var sk2 = util.decodeBase64(vec[1]);
    var msg = util.decodeBase64(vec[2]);
    var goodBox = util.decodeBase64(vec[3]);
    var box = nacl.box(msg, nonce, pk1, sk2);
    t.equal(util.encodeBase64(box), util.encodeBase64(goodBox));
    var openedBox = nacl.box.open(goodBox, nonce, pk1, sk2);
    t.equal(util.encodeBase64(openedBox), util.encodeBase64(msg));
  });
  t.end();
});

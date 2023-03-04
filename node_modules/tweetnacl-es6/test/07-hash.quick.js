import nacl from './../nacl-fast-es.js';
import test from './helpers/tap-esm.js';
import specVectors from './data/hash.spec.js';
import util from './helpers/nacl-util.js';

test('nacl.hash length', function(t) {
  t.equal(nacl.hash(new Uint8Array(0)).length, 64);
  t.equal(nacl.hash(new Uint8Array(100)).length, 64);
  t.end();
});

test('nacl.hash exceptions for bad types', function(t) {
  t.throws(function() { nacl.hash('string'); }, TypeError);
  t.throws(function() { nacl.hash([1,2,3]); }, TypeError);
  t.end();
});

test('nacl.hash specified test vectors', function(t) {
  specVectors.forEach(function(vec) {
    var goodHash = new Uint8Array(vec[0]);
    var msg = new Uint8Array(vec[1]);
    var hash = nacl.hash(msg);
    t.equal(util.encodeBase64(hash), util.encodeBase64(goodHash));
  });
  t.end();
});

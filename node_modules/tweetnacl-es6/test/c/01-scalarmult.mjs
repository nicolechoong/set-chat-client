import nacl from '../../nacl-fast-es.js';
import util from '../helpers/nacl-util.js';
import {execFile} from 'child_process';
import path from 'path';
import test from './../helpers/tap-esm.js';

var NUMBER_OF_TESTS = 1000;

function cscalarmult(n, p, callback) {
  var hexN = (Buffer.from(n)).toString('hex');
  var hexP = (Buffer.from(p)).toString('hex');

  execFile(path.resolve('cscalarmult'), [hexN, hexP], function(err, stdout) {
    if (err) throw err;
    callback(stdout.toString('utf8'));
  });
}

test('nacl.scalarMult (C)', function(t) {
  var k1 = {
    publicKey: util.decodeBase64('JRAWWRKVfZS2U/QiV+X2+PaabPfAB4H9p+BZkBN8ji8='),
    secretKey: util.decodeBase64('5g1pBmI3HL5GAjtt3/2FZDQVfGSMNohngN7OVSizBVE=')
  };

  function check(num) {
    var k2 = nacl.box.keyPair();
    var q1 = nacl.scalarMult(k1.secretKey, k2.publicKey);
    var q2 = nacl.scalarMult(k2.secretKey, k1.publicKey);

    t.equal(util.encodeBase64(q1), util.encodeBase64(q2),
            'scalarMult results should be equal');

    let hexQ = (Buffer.from(q1)).toString('hex');
    cscalarmult(k1.secretKey, k2.publicKey, function(cQ) {
      t.equal(hexQ, cQ);
      if (num >= NUMBER_OF_TESTS) {
        return;
      }
      check(num+1);
    });
  }
  
  t.timeout = 100000;
  check(0);
  t.end();
});

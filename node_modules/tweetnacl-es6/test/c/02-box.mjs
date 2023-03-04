import nacl from '../../nacl-fast-es.js';
import util from '../helpers/nacl-util.js';
import {spawn} from 'child_process';
import path from 'path';
import test from './../helpers/tap-esm.js';

function cbox(msg, sk, pk, n, callback) {
  var hexsk = (Buffer.from(sk)).toString('hex');
  var hexpk = (Buffer.from(pk)).toString('hex');
  var hexn = (Buffer.from(n)).toString('hex');
  var p = spawn(path.resolve('cbox'), [hexsk, hexpk, hexn]);
  var result = [];
  p.stdout.on('data', function(data) {
    result.push(data);
  });
  p.on('close', function(code) {
    return callback(Buffer.concat(result).toString('base64'));
  });
  p.on('error', function(err) {
    throw err;
  });
  p.stdin.write(msg);
  p.stdin.end();
}

test('nacl.box (C)', function(t) {
  var k1 = nacl.box.keyPair();

  function check(num, maxNum, next) {
    var sk2 = nacl.randomBytes(nacl.box.secretKeyLength);
    var msg = nacl.randomBytes(num);
    var nonce = nacl.randomBytes(24);
    var box = util.encodeBase64(nacl.box(msg, nonce, k1.publicKey, sk2));
    cbox(Buffer.from(msg), sk2, k1.publicKey, nonce, function(boxFromC) {
      t.equal(box, boxFromC, 'boxes should be equal');
      t.ok(nacl.box.open(util.decodeBase64(boxFromC), nonce, k1.publicKey, sk2),
                'opening box should succeed');
      if (num >= maxNum) {
        if (next) next();
        return;
      }
      check(num+1, maxNum, next);
    });
  }
  
  t.timeout = 120000;
  check(0, 1024, function() {
    check(16417, 16500, function() {});
  });
  t.end();
});

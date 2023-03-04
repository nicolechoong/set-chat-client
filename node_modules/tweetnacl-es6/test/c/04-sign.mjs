import nacl from '../../nacl-fast-es.js';
import util from '../helpers/nacl-util.js';
import {spawn} from 'child_process';
import path from 'path';
import test from './../helpers/tap-esm.js';

function csign(sk, msg, callback) {
  var hexsk = (Buffer.from(sk)).toString('hex');
  var p = spawn(path.resolve('csign'), [hexsk]);
  var result = [];
  p.stdout.on('data', function(data) {
    result.push(data);
  });
  p.on('close', function(code) {
    callback(Buffer.concat(result).toString('base64'));
  });
  p.on('error', function(err) {
    throw err;
  });
  p.stdin.write(msg);
  p.stdin.end();
}

test('nacl.sign (C)', function(t) {
  function check(num) {
    var keys = nacl.sign.keyPair();
    var msg = nacl.randomBytes(num);
    var signedMsg = util.encodeBase64(nacl.sign(msg, keys.secretKey));
    csign(keys.secretKey, Buffer.from(msg), function(signedFromC) {
      t.equal(signedMsg, signedFromC, 'signed messages should be equal');
      var openedMsg = nacl.sign.open(util.decodeBase64(signedFromC), keys.publicKey);
      t.ok(openedMsg!==null, 'open should succeed');
      t.equal(util.encodeBase64(openedMsg), util.encodeBase64(msg),
            'messages should be equal');
      if (num >= 100) {
        return;
      }
      check(num+1);
    });
  }

  t.timeout = 20000;
  check(0);
  t.end();
});

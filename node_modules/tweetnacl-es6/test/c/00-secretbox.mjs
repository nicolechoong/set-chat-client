import nacl from '../../nacl-fast-es.js';
import util from '../helpers/nacl-util.js'
import {spawn} from 'child_process';
import path from 'path';
import test from './../helpers/tap-esm.js';

function csecretbox(msg, n, k, callback) {
  var hexk = (Buffer.from(k)).toString('hex');
  var hexn = (Buffer.from(n)).toString('hex');
  var p = spawn(path.resolve('csecretbox'), [hexk, hexn]);
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

test('nacl.secretbox (C)', function(t) {
  var k = new Uint8Array(nacl.secretbox.keyLength),
      n = new Uint8Array(nacl.secretbox.nonceLength),
      i;
  for (i = 0; i < 32; i++) k[i] = i;
  for (i = 0; i < 24; i++) n[i] = i;

  function check(num, maxNum, next) {
    var msg = nacl.randomBytes(num);
    var box = util.encodeBase64(nacl.secretbox(msg, n, k));
    csecretbox(Buffer.from(msg), n, k, function(boxFromC) {
      t.equal(box, boxFromC, 'secretboxes should be equal');
	  t.ok(nacl.secretbox.open(util.decodeBase64(boxFromC), n, k), 'opening should succeed');
      if (num >= maxNum) {
        if (next) next();
        return;
      }
      check(num+1, maxNum, next);
    });
  }

  t.timeout = 100000;
  check(0, 1024, function() {
    check(16418, 16500, function() {
      check(1000000, 0, function() {

      });
    });
  });
  t.end();
});

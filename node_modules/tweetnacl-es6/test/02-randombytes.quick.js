import nacl from './../nacl-fast-es.js';
import test from './helpers/tap-esm.js';
import util from './helpers/nacl-util.js'

test('nacl.randomBytes', async function(t) {
  var set = {}, s, i;

  for (i = 0; i < 10000; i++) {

    s = util.encodeBase64(nacl.randomBytes(32));
    if (set[s]) {
      t.fail('duplicate random sequence! ', s);
      return;
    }
    set[s] = true;
  }
  t.pass('no collisions');
  t.end();
});
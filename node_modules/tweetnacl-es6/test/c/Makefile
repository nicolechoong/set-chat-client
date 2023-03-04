CFLAGS=-O3

all: csecretbox cscalarmult cbox chash csign csign-keypair

csecretbox: csecretbox.o tweetnacl.o

cscalarmult: cscalarmult.o tweetnacl.o

cbox: cbox.o tweetnacl.o

chash: chash.o tweetnacl.o

csign: csign.o tweetnacl.o

csign-keypair: csign-keypair.o tweetnacl.o

test: test_secretbox test_scalarmult test_box test_hash test_sign test_signkeypair clean

test_secretbox: csecretbox
	node ./00-secretbox.mjs

test_scalarmult: cscalarmult
	node ./01-scalarmult.mjs

test_box: cbox
	node ./02-box.mjs

test_hash: chash
	node ./03-hash.mjs

test_sign: csign
	node ./04-sign.mjs

test_signkeypair: csign csign-keypair
	node ./05-sign-keypair.mjs

clean:
	rm *.o csecretbox cscalarmult cbox chash csign csign-keypair

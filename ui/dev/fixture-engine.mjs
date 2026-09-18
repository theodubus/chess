import { createInterface } from 'node:readline';

// Un vrai processus, mais aucune recherche : il vérifie uniquement le transport.
createInterface({ input: process.stdin }).on('line', line => {
  if (line === 'uci') {
    process.stdout.write('id name Processus de test\r\nuci');
    setTimeout(() => process.stdout.write('ok\r\n'), 5);
  } else if (line === 'isready') process.stdout.write('readyok\n');
  else if (line === 'quit') process.exit(0);
});

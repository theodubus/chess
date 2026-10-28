/**
 * Les limites de la mémoire qu'un module importe, lues dans son binaire.
 *
 * `WebAssembly.Module.imports` nomme la mémoire sans dire sa taille ; or la
 * mémoire partagée fournie doit en respecter le minimum, et ne pas en
 * dépasser le maximum. Le moteur à fils déclare les siennes à l'édition des
 * liens : les lire ici évite de les recopier.
 *
 * Écrit sans syntaxe propre à TypeScript hors des types, pour que Node le
 * charge tel quel.
 */
export function importedMemoryLimits(bytes: Uint8Array) {
  let at = 8;
  const leb = () => {
    let result = 0;
    let shift = 0;
    let byte;
    do {
      byte = bytes[at++];
      result += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80);
    return result;
  };
  const skipName = () => {
    const length = leb();
    at += length;
  };
  while (at < bytes.length) {
    const id = bytes[at++];
    const size = leb();
    const end = at + size;
    if (id === 2) {
      const count = leb();
      for (let index = 0; index < count; index++) {
        skipName();
        skipName();
        const kind = bytes[at++];
        if (kind === 0) leb();
        else if (kind === 1) {
          at++;
          const flags = bytes[at++];
          leb();
          if (flags & 1) leb();
        } else if (kind === 2) {
          const flags = bytes[at++];
          const initial = leb();
          const maximum = flags & 1 ? leb() : 65536;
          return { initial, maximum, shared: (flags & 2) !== 0 };
        } else if (kind === 3) at += 2;
        else break;
      }
    }
    at = end;
  }
  throw new Error("Le module n’importe aucune mémoire.");
}

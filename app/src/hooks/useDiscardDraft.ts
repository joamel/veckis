import { common as str } from '../lib/svenska';
import type { ConfirmOptions } from '../components/ConfirmDialog';

type ConfirmFn = (opts: ConfirmOptions) => void;

/** Returnerar en `tryClose`-funktion som visar en "Vill du slänga utkastet?"-dialog
 *  om formuläret är dirty, annars stänger direkt. */
export function useDiscardDraft(confirm: ConfirmFn) {
  return (isDirty: boolean, onDiscard: () => void) => {
    if (!isDirty) { onDiscard(); return; }
    confirm({
      title: str.discardDraft.title,
      buttons: [
        { label: str.discardDraft.keep, style: 'cancel' },
        { label: str.discardDraft.discard, style: 'destructive', onPress: onDiscard },
      ],
    });
  };
}

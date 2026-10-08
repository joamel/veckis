import { Platform, findNodeHandle } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { Component } from 'react';

// Android: stänger av autofyll i fönstret som en vy ligger i. Behövs för
// <Modal> (ark, dialoger), som ritas i ett eget fönster utanför huvud-
// aktiviteten där withDisableAutofill redan stänger av det. Se
// AutofillGuardModule.kt.
//
// Valfri: byggen före modulen (v22), iOS och webben saknar den — no-op där.

interface AutofillGuardNative {
  excludeWindowOf(viewTag: number): Promise<boolean>;
}

const native = Platform.OS === 'android'
  ? requireOptionalNativeModule<AutofillGuardNative>('AutofillGuard')
  : null;

export function excludeWindowFromAutofill(view: Component | null): void {
  if (!native || !view) return;
  const tag = findNodeHandle(view);
  if (tag == null) return;
  native.excludeWindowOf(tag).catch(() => { /* best-effort */ });
}

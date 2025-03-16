import { ComponentFixture } from '@angular/core/testing';
import { isNumber } from '@tubular/util';

export async function sendTestKey(key: string, element: HTMLElement, fixture: ComponentFixture<any>,
                                  duration?: number): Promise<void> {
  return new Promise<void>(resolve => {
    const eventOpts = { key, bubbles: true, cancelable: true };
    const target = element.querySelector('.tbw-dse-wrapper');

    target.dispatchEvent(new KeyboardEvent('keydown', eventOpts));
    setTimeout(() => {
      target.dispatchEvent(new KeyboardEvent('keyup', eventOpts));
      fixture.detectChanges();
      fixture.whenStable().then(resolve);
    }, duration ?? 25);
  });
}

export async function sendTestClick(element: HTMLElement, fixture: ComponentFixture<any>,
                                    focusHelp?: null | (() => void)): Promise<void>;
export async function sendTestClick(element: HTMLElement, fixture: ComponentFixture<any>,
                                    duration?: number, focusHelp?: null | (() => void)): Promise<void>;
export async function sendTestClick(element: HTMLElement, fixture: ComponentFixture<any>,
                                    focusHelpOrDuration?: number| null | (() => void), focusHelp?: () => void): Promise<void> {
  let duration = 25;

  if (isNumber(focusHelpOrDuration))
    duration = focusHelpOrDuration;
  else
    focusHelp = focusHelpOrDuration;

  const rect = element.getBoundingClientRect();
  const eventOpts = { view: window, button: 0, bubbles: true, cancelable: true,
                      screenX: rect.x + rect.width / 2, screenY: rect.y + rect.height / 2,
                      clientX: rect.width / 2, clientY: rect.height / 2} as MouseEventInit;

  element.dispatchEvent(new MouseEvent('mousedown', eventOpts));

  return new Promise<void>(resolve => {
    setTimeout(() => {
      element.dispatchEvent(new MouseEvent('mouseup', eventOpts));
      fixture.detectChanges();

      if (focusHelp)
        focusHelp();
      else if (focusHelp !== null) {
        element.dispatchEvent(new Event('focus', eventOpts));
        fixture.detectChanges();
      }

      fixture.whenStable().then(resolve);
    }, duration);
  });
}

export function getCSSProperty(className: string, property: string): string {
  className = '.' + className;

  for (const styleSheet of document.styleSheets) {
    try {
      for (const rule of styleSheet.cssRules) {
        if ((rule as CSSStyleRule).selectorText === className)
          return (rule as CSSStyleRule).styleMap.get(property).toString();
      }
    }
    catch (e) {
      console.error('Error accessing stylesheet rules:', e);
    }
  }

  return null;
}

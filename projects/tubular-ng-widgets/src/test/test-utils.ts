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

  const eventOpts = { bubbles: true, cancelable: true } as MouseEventInit;

  if (!element.dispatchEvent) {
    const rect = element.getBoundingClientRect();

    eventOpts.screenX = rect.left + rect.width / 2;
    eventOpts.screenY = rect.top + rect.height / 2;
    element = document.body;
  }

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

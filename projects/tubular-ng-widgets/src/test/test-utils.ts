import { ComponentFixture } from '@angular/core/testing';

export async function sendTestKey(key: string, element: HTMLElement, fixture: ComponentFixture<any>): Promise<void> {
  return new Promise<void>(resolve => {
    const eventOpts = { key, bubbles: true, cancelable: true };
    const target = element.querySelector('.tbw-dse-wrapper');

    target.dispatchEvent(new KeyboardEvent('keydown', eventOpts));
    setTimeout(() => {
      target.dispatchEvent(new KeyboardEvent('keyup', eventOpts));
      fixture.detectChanges();
      fixture.whenStable().then(resolve);
    }, 100);
  });
}

export async function sendTextClick(element: HTMLElement, fixture: ComponentFixture<any>,
                                    focusHelp?: () => void): Promise<void> {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

  return new Promise<void>(resolve => {
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    if (focusHelp)
      focusHelp();

    fixture.whenStable().then(resolve);
  });
}

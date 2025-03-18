import { AngleEditorComponent, AngleStyle } from './angle-editor.component';
import { Component, ViewChild } from '@angular/core';
import { CommonTestEnvironment, sharedBeforeEach } from '../digit-sequence-editor/digit-sequence-editor.common.spec';

@Component({
  template: `
    <tbw-angle-editor #inner></tbw-angle-editor>
  `,
  imports: [AngleEditorComponent],
  standalone: true
})
class AngleComponent {
  @ViewChild('inner', { static: true }) inner: AngleEditorComponent;
}

describe('AngleEditorComponent', () => {
  let cte: CommonTestEnvironment<AngleComponent, AngleEditorComponent>;
  let angleEditor: AngleEditorComponent;

  beforeEach(async () => {
    cte = await sharedBeforeEach(AngleComponent, AngleEditorComponent, 'tbw-angle-editor', '0');
    angleEditor = cte.component.inner;
  });

  afterEach(() => {
    cte.errorObserver.disconnect();
  });

  it('should display correct angle', async () => {
    expect(cte.readDisplayedText()).toEqual('+000°00’00”');
  });

  it('should roll digits', async () => {
    await cte.clickDigit(cte.digits.length - 2);
    await cte.sendKey('ArrowUp');
    expect(cte.readDisplayedText()).toEqual('+000°00’01”');
    await cte.sendKey('ArrowDown');
    await cte.sendKey('ArrowDown');
    expect(cte.readDisplayedText()).toEqual('-000°00’01”');
  });

  it('should wrap around with warning flash, ±180°', async () => {
    await cte.paste('+179°59’59”');
    await cte.clickDigit(cte.digits.length - 2);
    await cte.sendKey('ArrowUp');
    expect(cte.statusBackground).toEqual(cte.warningColor);
    expect((AngleEditorComponent.prototype as any).warningFlash).toHaveBeenCalled();
    expect(cte.readDisplayedText()).toEqual('-180°00’00”');
  });

  it("shouldn't go past ±90°", async () => {
    angleEditor.options = { angleStyle: AngleStyle.DD_MM, compass: true };
    cte.detectChanges();
    await cte.whenStable();
    cte.collectDigits();
    await cte.paste('89°59’S');
    await cte.clickDigit(-3);
    await cte.sendKey('ArrowDown');
    expect(cte.readDisplayedText()).toEqual('90°00’S');
    await cte.sendKey('ArrowDown');
    expect(cte.statusBackground).toEqual(cte.errorColor);
    expect((AngleEditorComponent.prototype as any).errorFlash).toHaveBeenCalled();
    expect(cte.readDisplayedText()).toEqual('90°00’S');
  });

  it('should pin value within ±90°', async () => {
    angleEditor.options = { angleStyle: AngleStyle.DD_MM, compass: true };
    cte.detectChanges();
    await cte.whenStable();
    cte.collectDigits();
    await cte.paste('89°59’S');
    await cte.clickDigit(0);
    await cte.sendKey('9');
    expect(cte.readDisplayedText()).toEqual('90°00’S');
  });
});

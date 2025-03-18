import { AngleEditorComponent } from './angle-editor.component';
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

  beforeEach(async () => {
    cte = await sharedBeforeEach(AngleComponent, AngleEditorComponent, 'tbw-angle-editor', '0');
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
});

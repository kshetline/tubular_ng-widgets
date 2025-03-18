import { TimeEditorComponent } from './time-editor.component';
import { Component, ViewChild } from '@angular/core';
import { CommonTestEnvironment, sharedBeforeEach } from '../digit-sequence-editor/digit-sequence-editor.common.spec';
import { DayOfWeek } from '@tubular/time';

@Component({
  template: `
    <tbw-time-editor #inner options="iso" timezone="utc"></tbw-time-editor>
  `,
  imports: [TimeEditorComponent],
  standalone: true
})
class TimeComponent {
  @ViewChild('inner', { static: true }) inner: TimeEditorComponent;
}

describe('TimeEditorComponent', () => {
  // @ts-ignore
  let cte: CommonTestEnvironment<TimeComponent, TimeEditorComponent>;
  let timeEditor: TimeEditorComponent;

  const sampleTime = '2012-03-04T05:06:07';
  const sampleTimeMs = new Date(sampleTime + 'Z').getTime();

  beforeEach(async () => {
    // @ts-ignore
    cte = await sharedBeforeEach(TimeComponent, TimeEditorComponent, 'tbw-time-editor', sampleTime);
    timeEditor = cte.component.inner;
  });

  afterEach(() => {
    cte.errorObserver.disconnect();
  });

  it('should display correct time', async () => {
    expect(timeEditor.value).toEqual(sampleTimeMs);
    expect(cte.readDisplayedText()).toEqual(sampleTime);
    const wallTime = timeEditor.wallTime;
    expect(wallTime.year).toEqual(2012);
    expect(wallTime.month).toEqual(3);
    expect(wallTime.day).toEqual(4);
    expect(wallTime.dayOfWeek).toEqual(DayOfWeek.SUNDAY);
  });

  it('should roll digits', async () => {
    await cte.clickDigit(-1); // Roll one second forward
    await cte.sendKey('ArrowUp');
    expect(cte.readDisplayedText()).toEqual('2012-03-04T05:06:08');
    await cte.sendKey('ArrowDown'); // Roll two seconds back
    await cte.sendKey('ArrowDown');
    expect(cte.readDisplayedText()).toEqual('2012-03-04T05:06:06');
    await cte.clickDigit(5); // Roll 10 months forward
    await cte.sendKey('ArrowUp');
    expect(cte.readDisplayedText()).toEqual('2013-01-04T05:06:06');
  });

  it('should do upward auto-repeated digit rolling', async () => {
    await cte.clickDigit(-1); // Roll one second forward repeatedly
    await cte.sendKey('ArrowUp', 2000);
    const currentValue = cte.readDisplayedText();
    expect(timeEditor.value - (sampleTimeMs + 17000)).toBeLessThan(3000);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await cte.whenStable();
    expect(cte.readDisplayedText()).toEqual(currentValue); // Make sure rolling stopped
  }, 7500);

  it('should do downward auto-repeated digit rolling', async () => {
    await cte.clickDigit(-2); // Roll tens seconds backward repeatedly
    await cte.sendKey('ArrowDown', 2000);
    const currentValue = cte.readDisplayedText();
    expect(timeEditor.value - (sampleTimeMs - 170000)).toBeLessThan(30000);
    await new Promise(resolve => setTimeout(resolve, 1000));
    await cte.whenStable();
    expect(cte.readDisplayedText()).toEqual(currentValue); // Make sure rolling stopped
  }, 7500);

  it('should do upward auto-repeated digit rolling via up-arrow icon', async () => {
    await cte.clickDigit(-1); // Roll one second forward repeatedly
    await cte.clickElement(cte.upArrow, 2000);
    expect(timeEditor.value - (sampleTimeMs + 17000)).toBeLessThan(3000);
  });

  it('should skip over "spring ahead" hour', async () => {
    timeEditor.timezone = 'America/New_York';
    timeEditor.options =
      { 'locale': 'en-US', showSeconds: false, dateFieldOrder: 0, hourStyle: 0, meridiemStyle: 0, showDstSymbol: true };
    await cte.paste('03/09/25, 01:59 AM');
    expect(cte.readDisplayedText()).toEqual('03/09/25,01:59AM');
    await cte.clickDigit(-1); // Roll one minute forward
    await cte.sendKey('ArrowUp');
    expect(cte.readDisplayedText()).toEqual('03/09/25,03:00AM§');
    await cte.clickElement(cte.downArrow); // And back again
    expect(cte.readDisplayedText()).toEqual('03/09/25,01:59AM');
  });

  it('should repeat "fall back" hour', async () => {
    timeEditor.timezone = 'America/New_York';
    timeEditor.options =
      { 'locale': 'en-US', showSeconds: false, dateFieldOrder: 0, hourStyle: 0, meridiemStyle: 0, showDstSymbol: true };
    await cte.paste('11/02/25, 01:59 AM');
    expect(cte.readDisplayedText()).toEqual('11/02/25,01:59AM§');
    await cte.clickDigit(-1); // Roll one minute forward
    await cte.sendKey('ArrowUp');
    expect(cte.readDisplayedText()).toEqual('11/02/25,01:00AM');
  });

  it('should accept typed-in input', async () => {
    await cte.clickDigit(0);
    await cte.sendKey('1');
    await cte.sendKey('9');
    await cte.sendKey('9');
    await cte.sendKey('6');
    expect(cte.readDisplayedText()).toEqual('1996-03-04T05:06:07');
  });


  it('should handle AM/PM switch', async () => {
    timeEditor.options =
      { 'locale': 'en-US', showSeconds: false, dateFieldOrder: 0, hourStyle: 0, meridiemStyle: 0, showDstSymbol: true };
    cte.detectChanges();
    await cte.whenStable();
    expect(cte.readDisplayedText()).toEqual('03/04/12,05:06AM');
    await cte.clickDigit(-2);
    await cte.sendKey('ArrowUp');
    expect(cte.readDisplayedText()).toEqual('03/04/12,05:06PM');
    await cte.sendKey('ArrowDown');
    expect(cte.readDisplayedText()).toEqual('03/04/12,05:06AM');
    await cte.sendKey('P');
    expect(cte.readDisplayedText()).toEqual('03/04/12,05:06PM');
    await cte.sendKey('A');
    expect(cte.readDisplayedText()).toEqual('03/04/12,05:06AM');
  });

  it('should accept automatic adjust date to match length of month', async () => {
    await cte.paste('2012-03-31T05:06:07');
    await cte.clickDigit(6);
    await cte.sendKey('2');
    expect(cte.readDisplayedText()).toEqual('2012-02-29T05:06:07');
  });

  it('should reject invalid month, advance to highest month', async () => {
    await cte.clickDigit(5);
    await cte.sendKey('1');
    expect(cte.readDisplayedText()).toEqual('2012-12-04T05:06:07');
  });

  it('should reject bad input', async () => {
    await cte.clickDigit(0);
    await cte.sendKey('X');
    expect(cte.statusBackground).toEqual(cte.errorColor);
    expect((TimeEditorComponent.prototype as any).errorFlash).toHaveBeenCalled();
    expect(cte.readDisplayedText()).toEqual(sampleTime);
  });

  it('should display leap seconds', async () => {
    timeEditor.tai = true;
    cte.detectChanges();
    await cte.whenStable();
    await cte.paste('2016-12-31T23:59:59');
    expect(cte.readDisplayedText()).toEqual('2016-12-31T23:59:59');
    await cte.clickDigit(-1);
    await cte.sendKey('ArrowUp');
    expect(cte.readDisplayedText()).toEqual('2016-12-31T23:59:60');
    await cte.clickElement(cte.upArrow);
    expect(cte.readDisplayedText()).toEqual('2017-01-01T00:00:00');
    await cte.clickElement(cte.downArrow);
    await cte.clickElement(cte.downArrow);
    expect(cte.readDisplayedText()).toEqual('2016-12-31T23:59:59');
    await cte.clickDigit(-2);
    await cte.sendKey('6');
    expect(cte.readDisplayedText()).toEqual('2016-12-31T23:59:60');
  });

  it('should enforce minimum time value', async () => {
    timeEditor.min = '2012-01-01T00:00:00';
    cte.detectChanges();
    await cte.whenStable();
    await cte.clickDigit(6);
    await cte.sendKey('ArrowDown');
    await cte.sendKey('ArrowDown');
    expect(cte.readDisplayedText()).toEqual('2012-01-04T05:06:07');
    await cte.sendKey('ArrowDown');
    expect(cte.statusBackground).toEqual(cte.errorColor);
    expect((TimeEditorComponent.prototype as any).errorFlash).toHaveBeenCalled();
    expect(cte.readDisplayedText()).toEqual('2012-01-04T05:06:07');
  });

  it('should enforce maximum time value', async () => {
    await cte.paste('2028-02-27T00:00:00');
    timeEditor.max = '2028-02-29T23:59:59';
    cte.detectChanges();
    await cte.whenStable();
    await cte.clickDigit(9);
    await cte.sendKey('ArrowUp');
    await cte.sendKey('ArrowUp');
    expect(cte.readDisplayedText()).toEqual('2028-02-29T00:00:00');
    await cte.sendKey('ArrowUp');
    expect(cte.statusBackground).toEqual(cte.errorColor);
    expect((TimeEditorComponent.prototype as any).errorFlash).toHaveBeenCalled();
    expect(cte.readDisplayedText()).toEqual('2028-02-29T00:00:00');
  });
});

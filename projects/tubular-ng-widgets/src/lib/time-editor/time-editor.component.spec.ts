import { TimeEditorComponent } from './time-editor.component';
import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { sendTestKey, sendTestClick, getCSSProperty } from '../../test/test-utils';

@Component({
  template: `
    <tbw-time-editor #timeEditor options="iso" timezone="utc"></tbw-time-editor>
  `,
  imports: [TimeEditorComponent],
  standalone: true
})
class TimeComponent {
  @ViewChild('timeEditor', { static: true }) timeEditor: TimeEditorComponent;
}

describe('TimeEditorComponent', () => {
  let fixture: ComponentFixture<TimeComponent>;
  let timeComponent: TimeComponent;
  let timeEditor: TimeEditorComponent;
  let timeElement: HTMLElement;
  let digits: HTMLElement[];
  let upArrow: HTMLElement;
  let downArrow: HTMLElement;
  let stateIndicator: HTMLElement;

  function byCss(selector: string): HTMLElement {
    return fixture.debugElement.query(By.css(selector))?.nativeElement;
  }

  async function paste(text: string): Promise<void> {
    timeEditor.doPaste(text);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function dseItemSort(a: Element, b: Element): number {
    const av = parseInt(a.getAttribute('data-name').substring(9));
    const bv = parseInt(b.getAttribute('data-name').substring(9));

    return av - bv;
  }

  function collectDigits(): void {
    digits = Array.from(timeElement.querySelectorAll('[data-name^="dse-item-"]'))
      .sort((a, b) => dseItemSort(a, b)) as unknown as HTMLElement[];
    upArrow = timeElement.querySelector('[data-name="up"]') as HTMLElement;
    downArrow = timeElement.querySelector('[data-name="down"]') as unknown as HTMLElement;
  }

  function readDisplayedText(): string {
    collectDigits();
    return digits.map(d => d.textContent?.trim() || '').join('');
  }

  function sendKey(key: string, duration?: number): Promise<void> {
    return sendTestKey(key, timeElement, fixture, duration);
  }

  function clickDigit(index: number, duration?: number): Promise<void> {
    return sendTestClick(digits[index], fixture, duration);
  }

  const sampleTime = '2012-03-04T05:06:07';
  const sampleTimeMs = new Date(sampleTime + 'Z').getTime();
  let errorObserver: MutationObserver;
  let statusBackground: string;
  let errorColor: string;

  beforeAll(() => {
    errorColor = getCSSProperty('tbw-error-background', 'background-color');
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideAnimations()]
    }).compileComponents();
    fixture = TestBed.createComponent(TimeComponent);
    timeComponent = fixture.componentInstance;
    timeEditor = timeComponent.timeEditor;
    timeElement = byCss('tbw-time-editor');
    stateIndicator = byCss('.tbw-dse-state-indicator');
    await paste(sampleTime);
    errorObserver = new MutationObserver(() => {
      if (stateIndicator.style.backgroundColor)
        statusBackground = stateIndicator.style.backgroundColor;
    });
    errorObserver.observe(stateIndicator, { attributes: true, attributeFilter: ['style', 'class'] });
    statusBackground = '';
    spyOn(TimeEditorComponent.prototype as any, 'errorFlash').and.callThrough();
    collectDigits();
    timeElement.focus();
  });

  afterEach(() => {
    errorObserver.disconnect();
  });

  it('should display correct time', async () => {
    expect(timeEditor.value).toEqual(sampleTimeMs);
    expect(readDisplayedText()).toEqual(sampleTime);
  });

  it('should roll digits', async () => {
    await clickDigit(digits.length - 1); // Roll one second forward
    await sendKey('ArrowUp');
    expect(readDisplayedText()).toEqual('2012-03-04T05:06:08');
    await sendKey('ArrowDown'); // Roll two seconds back
    await sendKey('ArrowDown');
    expect(readDisplayedText()).toEqual('2012-03-04T05:06:06');
    await clickDigit(5); // Roll 10 months forward
    await sendKey('ArrowUp');
    expect(readDisplayedText()).toEqual('2013-01-04T05:06:06');
  });

  it('should do upward auto-repeated digit rolling', async () => {
    await clickDigit(digits.length - 1); // Roll one second forward repeatedly
    await sendKey('ArrowUp', 2000);
    expect(timeEditor.value - (sampleTimeMs + 17000)).toBeLessThan(3000);
  });

  it('should do downward auto-repeated digit rolling', async () => {
    await clickDigit(digits.length - 2); // Roll tens seconds backward repeatedly
    await sendKey('ArrowDown', 2000);
    expect(timeEditor.value - (sampleTimeMs - 170000)).toBeLessThan(30000);
  });

  it('should do upward auto-repeated digit rolling via up-arrow icon', async () => {
    await clickDigit(digits.length - 1); // Roll one second forward repeatedly
    await sendTestClick(upArrow, fixture, 2000);
    expect(timeEditor.value - (sampleTimeMs + 17000)).toBeLessThan(3000);
  });

  it('should skip over "spring ahead" hour', async () => {
    timeEditor.timezone = 'America/New_York';
    timeEditor.options =
      { 'locale': 'en-US', showSeconds: false, dateFieldOrder: 0, hourStyle: 0, meridiemStyle: 0, showDstSymbol: true };
    await paste('03/09/25, 01:59 AM');
    expect(readDisplayedText()).toEqual('03/09/25,01:59AM');
    await clickDigit(digits.length - 1); // Roll one minute forward
    await sendKey('ArrowUp');
    expect(readDisplayedText()).toEqual('03/09/25,03:00AM§');
    await sendTestClick(downArrow, fixture); // And back again
    expect(readDisplayedText()).toEqual('03/09/25,01:59AM');
  });

  it('should repeat "fall back" hour', async () => {
    timeEditor.timezone = 'America/New_York';
    timeEditor.options =
      { 'locale': 'en-US', showSeconds: false, dateFieldOrder: 0, hourStyle: 0, meridiemStyle: 0, showDstSymbol: true };
    await paste('11/02/25, 01:59 AM');
    expect(readDisplayedText()).toEqual('11/02/25,01:59AM§');
    await clickDigit(digits.length - 1); // Roll one minute forward
    await sendKey('ArrowUp');
    expect(readDisplayedText()).toEqual('11/02/25,01:00AM');
  });

  it('should accept typed-in input', async () => {
    await clickDigit(0);
    await sendKey('1');
    await sendKey('9');
    await sendKey('9');
    await sendKey('6');
    expect(readDisplayedText()).toEqual('1996-03-04T05:06:07');
  });


  it('should handle AM/PM switch', async () => {
    timeEditor.options =
      { 'locale': 'en-US', showSeconds: false, dateFieldOrder: 0, hourStyle: 0, meridiemStyle: 0, showDstSymbol: true };
    fixture.detectChanges();
    await fixture.whenStable();
    expect(readDisplayedText()).toEqual('03/04/12,05:06AM');
    await clickDigit(digits.length - 2);
    await sendKey('ArrowUp');
    expect(readDisplayedText()).toEqual('03/04/12,05:06PM');
    await sendKey('ArrowDown');
    expect(readDisplayedText()).toEqual('03/04/12,05:06AM');
    await sendKey('P');
    expect(readDisplayedText()).toEqual('03/04/12,05:06PM');
    await sendKey('A');
    expect(readDisplayedText()).toEqual('03/04/12,05:06AM');
  });

  it('should accept automatic adjust date to match length of month', async () => {
    await paste('2012-03-31T05:06:07');
    await clickDigit(6);
    await sendKey('2');
    expect(readDisplayedText()).toEqual('2012-02-29T05:06:07');
  });

  it('should reject invalid month, advance to highest month', async () => {
    await clickDigit(5);
    await sendKey('1');
    expect(readDisplayedText()).toEqual('2012-12-04T05:06:07');
  });

  it('should reject bad input', async () => {
    await clickDigit(0);
    await sendKey('X');
    expect(statusBackground).toEqual(errorColor);
    expect((TimeEditorComponent.prototype as any).errorFlash).toHaveBeenCalled();
    expect(readDisplayedText()).toEqual(sampleTime);
  });

  it('should display leap seconds', async () => {
    timeEditor.tai = true;
    fixture.detectChanges();
    await fixture.whenStable();
    await paste('2016-12-31T23:59:59');
    expect(readDisplayedText()).toEqual('2016-12-31T23:59:59');
    await clickDigit(digits.length - 1);
    await sendKey('ArrowUp');
    expect(readDisplayedText()).toEqual('2016-12-31T23:59:60');
    await sendTestClick(upArrow, fixture);
    expect(readDisplayedText()).toEqual('2017-01-01T00:00:00');
    await sendTestClick(downArrow, fixture);
    await sendTestClick(downArrow, fixture);
    expect(readDisplayedText()).toEqual('2016-12-31T23:59:59');
    await clickDigit(digits.length - 2);
    await sendKey('6');
    expect(readDisplayedText()).toEqual('2016-12-31T23:59:60');
  });

  it('should enforce minimum time value', async () => {
    timeEditor.min = '2012-01-01T00:00:00';
    fixture.detectChanges();
    await fixture.whenStable();
    await clickDigit(6);
    await sendKey('ArrowDown');
    await sendKey('ArrowDown');
    expect(readDisplayedText()).toEqual('2012-01-04T05:06:07');
    await sendKey('ArrowDown');
    expect(statusBackground).toEqual(errorColor);
    expect((TimeEditorComponent.prototype as any).errorFlash).toHaveBeenCalled();
    expect(readDisplayedText()).toEqual('2012-01-04T05:06:07');
  });

  it('should enforce maximum time value', async () => {
    await paste('2028-02-27T00:00:00');
    timeEditor.max = '2028-02-29T23:59:59';
    fixture.detectChanges();
    await fixture.whenStable();
    await clickDigit(9);
    await sendKey('ArrowUp');
    await sendKey('ArrowUp');
    expect(readDisplayedText()).toEqual('2028-02-29T00:00:00');
    await sendKey('ArrowUp');
    expect(statusBackground).toEqual(errorColor);
    expect((TimeEditorComponent.prototype as any).errorFlash).toHaveBeenCalled();
    expect(readDisplayedText()).toEqual('2028-02-29T00:00:00');
  });
});

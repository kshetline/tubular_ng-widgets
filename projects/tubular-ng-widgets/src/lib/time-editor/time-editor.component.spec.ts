import { TimeEditorComponent } from './time-editor.component';
import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { sendTestKey, sendTestClick } from '../../test/test-utils';

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
  // let downArrow: HTMLElement;

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
    // downArrow = timeElement.querySelectorAll('[data-name="down"]') as unknown as HTMLElement;
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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideAnimations()]
    }).compileComponents();
    fixture = TestBed.createComponent(TimeComponent);
    timeComponent = fixture.componentInstance;
    timeEditor = timeComponent.timeEditor;
    timeElement = byCss('tbw-time-editor');
    await paste(sampleTime);
    collectDigits();
    timeElement.focus();
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
});

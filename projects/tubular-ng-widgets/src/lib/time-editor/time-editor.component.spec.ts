import { TimeEditorComponent } from './time-editor.component';
import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { sendTestKey, sendTextClick } from '../../test/test-utils';

@Component({
  template: `
    <tbw-time-editor #timeEditor></tbw-time-editor>
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
  }

  function readDisplayedText(): string {
    collectDigits();
    return digits.map(d => d.textContent?.trim() || '').join('');
  }

  function sendKey(key: string): Promise<void> {
    return sendTestKey(key, timeElement, fixture);
  }

  function clickDigit(index: number): Promise<void> {
    return sendTextClick(digits[index], fixture, () => (timeEditor.hasFocus = true));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideAnimations()]
    }).compileComponents();
    fixture = TestBed.createComponent(TimeComponent);
    timeComponent = fixture.componentInstance;
    timeEditor = timeComponent.timeEditor;
    timeElement = byCss('tbw-time-editor');
    timeElement.focus();
  });

  const sampleTime = '2012-03-04T05:06:07';

  it('should display correct time', async () => {
    timeEditor.options = 'iso';
    fixture.detectChanges();
    await paste(sampleTime);
    expect(timeEditor.value).toEqual(new Date(sampleTime).getTime());
    expect(readDisplayedText()).toEqual(sampleTime);
  });

  it('should roll digits', async () => {
    timeEditor.options = 'iso';
    fixture.detectChanges();
    await paste(sampleTime);
    collectDigits();

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
});

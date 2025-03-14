import { TimeEditorComponent } from './time-editor.component';
import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';

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

  function readDisplayedText(): string {
    const elems = Array.from(timeElement.querySelectorAll('[data-name^="dse-item-"]')).sort((a, b) => dseItemSort(a, b));

    return elems.map(elem => elem.textContent?.trim() || '').join('');
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

  describe('should display correct time', () => {
    it('should display correct time', async () => {
      timeEditor.options = 'iso';
      fixture.detectChanges();
      await paste(sampleTime);
      expect(timeEditor.value).toEqual(new Date(sampleTime).getTime());
      expect(readDisplayedText()).toEqual(sampleTime);
    });
  });
});

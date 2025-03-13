import { TimeEditorComponent } from './time-editor.component';
import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

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
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({}).compileComponents();
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
      await paste(sampleTime);
      console.log(timeEditor.getValueAsText(), timeElement.textContent);
      expect(timeEditor.value).toEqual(new Date(sampleTime).getTime());
    });
  });
});

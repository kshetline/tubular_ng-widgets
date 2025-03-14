import { FormErrorDisplayComponent } from './form-error-display.component';
import { Component, ViewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

@Component({
  template: `
    <input type="text" [formControl]="control"/>
    <tbw-form-error-display #errorDisplay [control]="control"></tbw-form-error-display>
  `,
  imports: [ReactiveFormsModule, FormErrorDisplayComponent],
  standalone: true
})
class FormControlComponent {
  control = new FormControl('');
  @ViewChild('errorDisplay', { static: true }) errorDisplay: FormErrorDisplayComponent;
}

describe('FormErrorDisplayComponent', () => {
  let fixture: ComponentFixture<FormControlComponent>;
  let formControl: FormControlComponent;
  let errorDisplay: FormErrorDisplayComponent;
  let input: HTMLInputElement;

  async function fakeTyping(s: string): Promise<void> {
    input.value = s;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function byCss(selector: string): HTMLElement {
    return fixture.debugElement.query(By.css(selector))?.nativeElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({}).compileComponents();
    fixture = TestBed.createComponent(FormControlComponent);
    input = fixture.debugElement.query(By.css('input')).nativeElement as HTMLInputElement;
    formControl = fixture.componentInstance;
    errorDisplay = formControl.errorDisplay;
  });

  it('should not try to show error if control is undefined', () => {
    errorDisplay.control = undefined;
    expect(errorDisplay.shouldShowErrors()).toBeFalse();
  });

  it('should show no error if control is valid', async () => {
    expect(errorDisplay.shouldShowErrors()).toBeFalse();
    formControl.control.addValidators([Validators.required, Validators.minLength(4)]);
    fixture.detectChanges();
    await fakeTyping('book');
    expect(errorDisplay.shouldShowErrors()).toBeFalse();
  });

  it('should show error if control empty but required', async () => {
    formControl.control.addValidators(Validators.required);
    fixture.detectChanges();
    await fakeTyping('');
    expect(errorDisplay.shouldShowErrors()).toBeTrue();
    expect(byCss('ul')?.textContent).toEqual('This field is required');
    await fakeTyping('x');
    expect(byCss('ul')?.textContent || '').toEqual('');
  });

  it('should show error if input is shorter than required', async () => {
    formControl.control.addValidators(Validators.minLength(4));
    fixture.detectChanges();
    await fakeTyping('abc');
    expect(byCss('ul')?.textContent).toEqual('The min. allowed number of characters is 4');
    await fakeTyping('book');
    expect(byCss('ul')?.textContent || '').toEqual('');
  });

  it('should show double error for two validation failure', async () => {
    formControl.control.addValidators([Validators.min(1000), Validators.pattern(/^[02468]+$/)]);
    fixture.detectChanges();
    await fakeTyping('321');
    expect(byCss('ul')?.textContent).toEqual('The minimum allowed value is 1000The required pattern is: /^[02468]+$/');
    await fakeTyping('4206');
    expect(byCss('ul')?.textContent || '').toEqual('');
  });
});

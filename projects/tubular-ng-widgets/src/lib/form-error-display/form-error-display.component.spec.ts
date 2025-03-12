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
  standalone: false
})
class FormControlComponent {
  control = new FormControl('');
  @ViewChild('errorDisplay', { static: true }) errorDisplay: FormErrorDisplayComponent;
}

describe('FormErrorDisplayComponent', () => {
  let fixture: ComponentFixture<FormControlComponent>;
  let formControl: FormControlComponent;
  let comp: FormErrorDisplayComponent;
  let input: HTMLInputElement;

  function fakeTyping(s: string): void {
    input.value = s;
    input.dispatchEvent(new Event('input'));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FormControlComponent],
      imports: [ReactiveFormsModule, FormErrorDisplayComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FormControlComponent);
    input = fixture.debugElement.query(By.css('input')).nativeElement as HTMLInputElement;
    formControl = fixture.componentInstance;
    comp = formControl.errorDisplay;
  });

  describe('shouldShowErrors', () => {
    it('should not try to show error if control is undefined', () => {
      comp.control = undefined;
      fixture.detectChanges();
      expect(comp.shouldShowErrors()).toBeFalse();
    });

    it('should show no error if control is valid', () => {
      expect(comp.shouldShowErrors()).toBeFalse();
      formControl.control.addValidators([Validators.required, Validators.minLength(4)]);
      fixture.detectChanges();
      fakeTyping('book');
      expect(comp.shouldShowErrors()).toBeFalse();
    });

    it('should show error if control is invalid', async () => {
      formControl.control.addValidators([Validators.required, Validators.minLength(4)]);
      fixture.detectChanges();
      fakeTyping('');
      expect(comp.shouldShowErrors()).toBeTrue();
      expect(comp.listOfErrors()).toEqual(['This field is required']);
      fakeTyping('abc');
      await fixture.whenStable();
      expect(comp.shouldShowErrors()).toBeTrue();
      expect(comp.listOfErrors()).toEqual(['The min. allowed number of characters is 4']);
    });
  });
});
